# ./invoke.bash
ENDPOINT=http://localhost:4566
FUNCTION_NAME=geocodeIfClose
aws lambda invoke \
  --cli-binary-format raw-in-base64-out \
  --function-name ${FUNCTION_NAME} \
  --invocation-type RequestResponse \
  --no-sign-request \
  --payload '{ "myJsonData": "true" }' \
  --endpoint ${ENDPOINT} \
  output.json
