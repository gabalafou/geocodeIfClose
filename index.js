const geolib = require("geolib");
const axios = require("axios");
const { KinesisClient, PutRecordsCommand } = require("@aws-sdk/client-kinesis");
const { PostCoordinateSource } = require("@threatminder-system/tm-core");
const os = require("os");
const getKinesisMessages = require("./getKinesisMessages");
const debugLogger = require("debug");
const debug = debugLogger("debug");
const geocodingApiKey = process.env.GOOGLE_CLOUD_API_KEY;

const agentStampProperties = {
  name: "lambda:geoclode-if-close",
  version: "0.0.0",
};

const kinesisClientConfig = {
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION,
};
const kinesisClient = new KinesisClient(kinesisClientConfig);
const kinesisStreamName = process.env.GEOCODE_IF_CLOSE_PUB_STREAM;

/**
 * Take some free form text that may designate an address given a particular
 * context, and return a geocoded representation of the address as {latitude,
 * longitude} (in decimal) if the geocoded address is within a certain distance
 * of the given context. Otherwise return null.
 *
 * For example, if the text is "Free ice cream, Broadway and W 32nd St" and the
 * location context is Manhattan {latitude: 40.754932, longitude: -73.984016},
 * then this function would return {latitude: 40.748292, longitude: -73.988197},
 * which are the coordinates of the intersection of Broadway and W 32nd Street.
 *
 * @param {string} text Some free form text, which may or may not contain an
 *                      address
 * @param {object} locationContext {latitude, longitude} The context for the
 *                                 first parameter (gives an incomplete address
 *                                 meaning)
 * @param {number} searchRadius A distance (in meters) which specifies how far
 *                              from the location context to look for address
 *                              matches to the first parameter
 * @returns a {latitude, longitude} object, or null
 */
async function geocodeIfClose(text, locationContext, searchRadius) {
  // Make http request to Google geocoding API, using the viewport biasing feature
  // of the API to return relevant results
  debug("Get bounds of distance around location context using search radius");
  const [southwest, northeast] = geolib.getBoundsOfDistance(
    locationContext,
    searchRadius
  );
  debug("Fetch results from Google Geocoding API");
  const geocodingResults = await fetchGoogleGeocodingApiResults(
    text,
    { southwest, northeast },
    geocodingApiKey
  );

  // The Google Geocoding API does not treat the bounds as absolute. It will
  // return results outside the bounds if it thinks they are relevant, so we
  // have to check the results to make sure they are actually within the
  // desired search radius.
  debug("Filter results from Google Geocoding API");
  const closeEnoughResult = geocodingResults.find((result) =>
    geolib.isPointWithinRadius(
      result.geometry.location,
      locationContext,
      searchRadius
    )
  );

  // If there are results after filtering, return the first one (i.e., the one
  // Google thinks is most relevant), otherwise return null
  let returnVal;
  if (closeEnoughResult) {
    debug("Found close enough result", closeEnoughResult.geometry.location);
    const { lat, lng } = closeEnoughResult.geometry.location;
    returnVal = { latitude: lat, longitude: lng };
  } else {
    debug("Did not find close enough result");
    returnVal = null;
  }
  debug("Return", returnVal);
  return returnVal;
}

async function fetchGoogleGeocodingApiResults(text, bounds, apiKey) {
  // e.g.
  // https://maps.googleapis.com/maps/api/geocode/json?address=Winnetka&bounds=34.172684,-118.604794|34.236144,-118.500938&key=YOUR_API_KEY
  // bounds=southwest|northeast
  const { southwest, northeast } = bounds;
  const qsSW = `${southwest.latitude},${southwest.longitude}`;
  const qsNE = `${northeast.latitude},${northeast.longitude}`;
  const qsBounds = `${qsSW}|${qsNE}`;
  const response = await axios.get(
    "https://maps.googleapis.com/maps/api/geocode/json",
    {
      params: {
        address: text,
        bounds: qsBounds,
        key: apiKey,
      },
    }
  );
  debug("Response status code from Google Geocoding API", response.status);
  return response.data.results;
}

function areInputsValid({ text, locationContext, searchRadius }) {
  if (!text | !locationContext | !searchRadius) {
    return false;
  }
  if (!text.length | !(searchRadius > 0)) {
    return false;
  }
  try {
    parseMessageCoordinates(locationContext);
  } catch (err) {
    return false;
  }
  return true;
}

function parseMessageCoordinates(bracketTuple) {
  const [lat, long] = JSON.parse(
    bracketTuple.replace("{", "[").replace("}", "]")
  );
  return [lat, long];
}

function encodeKinesisRecord(partitionKey, message) {
  return {
    Data: JSON.stringify(message),
    PartitionKey: partitionKey,
  };
}

exports.handler = async (event, context, testRun = false) => {
  debug("Event:", event);

  const records = event.Records;
  const numberOfRecords = records.length;
  debug("Records:", numberOfRecords);

  const nextRecords = [];

  let messageCount = 0;
  for (const [partitionKey, message] of getKinesisMessages(records)) {
    debug(
      "======================================================================================"
    );
    debug(`Message #${++messageCount}/${numberOfRecords}`);

    // TODO add more logging, like what exists in the filter and db-doc lambdas

    const text = message.document.content;
    const locationContext = message.document.coordinates;
    const searchRadius = process.env.SEARCH_RADIUS;
    const { coordinateSource } = message.document;

    if (
      coordinateSource === PostCoordinateSource.TmFilterOptions &&
      areInputsValid({
        text,
        locationContext,
        searchRadius,
      })
    ) {
      const [latitude, longitude] = parseMessageCoordinates(locationContext);
      const formattedContext = { latitude, longitude };
      const result = await geocodeIfClose(text, formattedContext, searchRadius);
      if (result) {
        const { latitude, longitude } = result;
        message.document.coordinates = "{" + latitude + ", " + longitude + "}";
        debug("Updated coordinates:", message.document.coordinates);
        message.document.coordinateSource =
          PostCoordinateSource.GoogleGeocodingApi;
        debug("Updated coordinateSource:", message.document.coordinateSource);
      }
    }

    const agentStamp = {
      ...agentStampProperties,
      processedAt: Date.now(),
      hostname: os.hostname(),
    };
    message.processLog.push(agentStamp);
    const updatedRecord = encodeKinesisRecord(partitionKey, message);
    nextRecords.push(updatedRecord);
  }

  if (!testRun) {
    const params = {
      Records: nextRecords,
      StreamName: kinesisStreamName,
    };
    const command = new PutRecordsCommand(params);
    try {
      const kinesisResponse = await kinesisClient.send(command);
      console.log("Kinesis Response:", kinesisResponse);
    } catch (err) {
      console.log("Error sending Kinesis PutRecordsCommand:", err);
    }
  }

  return {
    records: nextRecords,
  };
};
