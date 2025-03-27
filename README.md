# AWS MFA Script

This script helps manage temporary AWS credentials using Multi-Factor Authentication (MFA).

## Installation

1. Clone this repository
2. Install dependencies:

```
npm install
```

3. Build the project:

```
npm run build
```

4. Create a symbolic link to make the script globally available (optional):

```
npm link
```

## Usage

You can run the script in the following ways:

Using npm:

```
npm run start -- -p SOURCE_PROFILE -o TARGET_PROFILE [-c MFA_CODE] [-d DURATION_SECONDS]
```

Using node after building:

```
node dist/index.js -p SOURCE_PROFILE -o TARGET_PROFILE [-c MFA_CODE] [-d DURATION_SECONDS]
```

Using ts-node for development:

```
npm run dev -- -p SOURCE_PROFILE -o TARGET_PROFILE [-c MFA_CODE] [-d DURATION_SECONDS]
```

If globally linked:

```
aws-mfa-script -p SOURCE_PROFILE -o TARGET_PROFILE [-c MFA_CODE] [-d DURATION_SECONDS]
```

### Parameters

- `-p, --profile`: Required. The AWS profile that contains your long-term access key.
- `-o, --output-profile`: Required. The AWS profile that will contain the temporary credentials.
- `-c, --mfa-code`: Optional. Your MFA code. If not provided, you will be prompted to enter it.
- `-d, --duration-seconds`: Optional. The duration in seconds that the temporary credentials should remain valid. Default is 36000 (10 hours).
- `--debug`: Optional. Enable debug mode to show detailed logs for each step of the process.

### Examples

Basic usage:

```
npm run start -- -p my-profile -o my-temp-profile
```

Specifying MFA code and duration:

```
npm run start -- -p my-profile -o my-temp-profile -c 123456 -d 43200
```

Running with debug mode:

```
npm run start -- -p my-profile -o my-temp-profile --debug
```

## How does it work

1. The script looks up the IAM user ARN associated with the source profile.
2. It constructs the MFA device serial number by replacing `:user/` with `:mfa/` in the ARN.
3. It then calls the AWS STS `get-session-token` API with your MFA code to retrieve temporary credentials.
4. These temporary credentials are written to your AWS credentials file (typically `~/.aws/credentials`) under the specified output profile.

The script supports the `AWS_SHARED_CREDENTIALS_FILE` environment variable to specify a custom location for your credentials file.

### Backward Compatibility

This script sets both `aws_session_token` and `aws_security_token` in the credentials file. This is to maintain compatibility with older AWS SDKs like boto2 that only recognize the legacy `aws_security_token` parameter.

## Requirements

- Node.js 14+
- TypeScript
- AWS CLI installed and configured with at least one profile
- MFA enabled for your AWS IAM user
