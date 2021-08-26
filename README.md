AWS lambda that takes an area (as a geopoint and a radius) and some text and
returns a geocoded address from within that area (if any)

# Local Dev

See:
https://erik-ekberg.medium.com/how-to-test-aws-lambda-locally-6f07bd36abd9

Open terminal and run the following command to start up local aws simulator (localstack):

```bash
docker compose up --build aws
```

Open new terminal and run the following commands to create and test the lambda locally:

```bash
# create lamdba in local simulated aws environment
./create-local-lambda.bash
# test lambda
./invoke.bash
# response will be output to file: output.json
```

# Debug logging

Debug logging can be turned on by setting `DEBUG=debug` in the lambda
environment, or by passing `debug=debug` when invoking the lambda.
