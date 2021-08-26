# ./invoke.bash
ENDPOINT=http://localhost:4566
FUNCTION_NAME=geocodeIfClose
PAYLOAD=`cat invoke.json`
aws lambda invoke \
  --cli-binary-format raw-in-base64-out \
  --function-name ${FUNCTION_NAME} \
  --invocation-type RequestResponse \
  --no-sign-request \
  --payload "${PAYLOAD}" \
  --endpoint ${ENDPOINT} \
  output.json
