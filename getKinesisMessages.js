module.exports = function* getKinesisMessages(records) {
  for (const record of records) {
    try {
      const jsonString = Buffer.from(record.kinesis.data, "base64");
      const messageObj = JSON.parse(jsonString);
      const partitionKey = record.kinesis.partitionKey;
      yield [partitionKey, messageObj];
    } catch (err) {
      console.error(err);
      continue;
    }
  }
}
