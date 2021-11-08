#! /bin/sh

set -e

# Tmp dir.
TMP_DIR="${PROJECT_HOME}/tmp"
GIT_HASH=$(git rev-parse --short HEAD)

# Check that the s3 bucket env var is set.
S3_UPLOAD_BUCKET=$1
if [[ -n "$S3_UPLOAD_BUCKET" ]]; then
    echo "INFO       | S3_UPLOAD_BUCKET=${S3_UPLOAD_BUCKET}"
else
    echo "ERROR      | Missing argument: The S3_UPLOAD_BUCKET env variable must be set."
    echo "ERROR      | Usage: ./package-lambda.sh <lambda-name> <s3-bucket>"
    exit 1
fi


LAMBDA_NAME="geocode-if-close"
PACKAGE_NAME="lambda-geocode-if-close-$GIT_HASH.zip"
S3_OBJECT_PATH="${S3_UPLOAD_BUCKET}/${LAMBDA_NAME}/${PACKAGE_NAME}"
echo "INFO       | S3_OBJECT_PATH=${S3_OBJECT_PATH}"

# Create the zip file in the tmp directory
zip -r "${TMP_DIR}/${PACKAGE_NAME}" index.js node_modules package.json package-lock.json



aws s3 cp "${TMP_DIR}/${PACKAGE_NAME}" "s3://${S3_OBJECT_PATH}"




# Cleanup
rm -r "${TMP_DIR}/${PACKAGE_NAME}"

# Remove the tmp dir if it's empty.
if [ ! "$(ls -A ${TMP_DIR})" ]; then
    rm -r "${TMP_DIR}"
fi



echo "INFO       | S3_OBJECT_LINK=https://s3.amazonaws.com/${S3_OBJECT_PATH}"
echo "INFO       | Success. Exiting now with status 0."

exit 0





