# Local Dev

See:
https://erik-ekberg.medium.com/how-to-test-aws-lambda-locally-6f07bd36abd9

```bash
docker compose up --build aws

# open new terminal
# create lamdba in local simulated aws environment
./create-local-lambda.bash
# test lambda
./invoke.bash
# response will be output to file: output.json
```
