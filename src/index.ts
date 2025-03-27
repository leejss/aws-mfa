#!/usr/bin/env node

import { execSync } from "child_process";
import { program } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as ini from "ini";
import * as readline from "readline";
import boxen from "boxen";
import chalk from "chalk";

// Get AWS shared credentials file path
const credFile =
  process.env.AWS_SHARED_CREDENTIALS_FILE ||
  path.join(os.homedir(), ".aws", "credentials");

// Set up command line arguments
program
  .requiredOption(
    "-p, --profile <profile>",
    "AWS profile that contains long-term access key",
  )
  .requiredOption(
    "-o, --output-profile <outputProfile>",
    "AWS profile to contain the temporary credentials",
  )
  .option("-c, --mfa-code <mfaCode>", "MFA code")
  .option(
    "-d, --duration-seconds <durationSeconds>",
    "The duration, in seconds, that the credentials should remain valid",
    "36000",
  )
  .option("--debug", "Enable debug mode to show detailed logs")
  .parse(process.argv);

const options = program.opts();

// Debug logger function
const debug = (message: string): void => {
  if (options.debug) {
    console.log(chalk.gray(`[DEBUG] ${message}`));
  }
};

// Get the IAM user information
try {
  debug(`Starting the process with profile: ${options.profile}`);
  debug(`Using credentials file: ${credFile}`);
  debug(`Output profile will be: ${options.outputProfile}`);
  debug(`Session duration set to: ${options.durationSeconds} seconds`);

  debug(`Running AWS STS get-caller-identity to fetch IAM user information`);
  const getCallerCommand = `aws sts get-caller-identity --profile ${options.profile}`;
  debug(`Executing command: ${getCallerCommand}`);

  const result = execSync(getCallerCommand, { encoding: "utf-8" });
  debug(`Command output: ${result}`);

  const output = JSON.parse(result);
  debug(`Parsed caller identity: ${JSON.stringify(output)}`);

  const iamUserArn = output.Arn;
  debug(`IAM User ARN: ${iamUserArn}`);

  const mfaSerial = iamUserArn.replace(":user/", ":mfa/");
  debug(`Derived MFA serial number: ${mfaSerial}`);

  console.log(
    boxen(chalk.blue(`Your MFA serial number is ${chalk.bold(mfaSerial)}`), {
      padding: 1,
      margin: 1,
      borderColor: "blue",
      borderStyle: "round",
      title: "MFA Serial",
      titleAlignment: "center",
    }),
  );

  // Get MFA code from input or argument
  let code: string;
  if (options.mfaCode) {
    debug(`Using MFA code provided in command line arguments`);
    code = options.mfaCode;
  } else {
    debug(`Prompting user for MFA code`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    code = await new Promise<string>((resolve) => {
      rl.question(chalk.yellow("MFA code: "), (answer: string) => {
        rl.close();
        resolve(answer);
      });
    });
    debug(`MFA code provided by user`);
  }

  // Get session token using the MFA code
  debug(`Requesting temporary security credentials from AWS STS`);
  const getSessionCommand = `aws sts get-session-token --profile ${options.profile} --serial-number ${mfaSerial} --token-code ${code} --duration-seconds ${options.durationSeconds}`;
  debug(`Executing command: ${getSessionCommand}`);

  const sessionResult = execSync(getSessionCommand, { encoding: "utf-8" });
  debug(`Session token request successful`);

  const sessionOutput = JSON.parse(sessionResult);
  debug(`Parsed session token response: ${JSON.stringify(sessionOutput)}`);

  const credentials = sessionOutput.Credentials;
  debug(`Retrieved temporary credentials`);
  debug(`Credential expiration: ${credentials.Expiration}`);

  // Update the AWS credentials file
  debug(`Updating AWS credentials file: ${credFile}`);
  let config: any;
  try {
    debug(`Reading existing credentials file`);
    const configContent = fs.readFileSync(credFile, "utf-8");
    debug(`Parsing INI content from credentials file`);
    config = ini.parse(configContent);
    debug(`Successfully parsed existing credentials file`);
  } catch (err) {
    debug(
      `Credentials file does not exist or cannot be read: ${
        (err as Error).message
      }`,
    );
    debug(`Creating new empty configuration`);
    config = {};
  }

  // Create or update the output profile section
  if (!config[options.outputProfile]) {
    debug(
      `Output profile ${options.outputProfile} does not exist, creating it`,
    );
    config[options.outputProfile] = {};
  } else {
    debug(
      `Output profile ${options.outputProfile} already exists, updating it`,
    );
  }

  // Set the temporary credentials
  debug(`Setting aws_access_key_id`);
  config[options.outputProfile].aws_access_key_id = credentials.AccessKeyId;

  debug(`Setting aws_secret_access_key`);
  config[options.outputProfile].aws_secret_access_key =
    credentials.SecretAccessKey;

  debug(`Setting aws_session_token`);
  config[options.outputProfile].aws_session_token = credentials.SessionToken;

  // Also set aws_security_token for backward compatibility with boto2
  debug(`Setting aws_security_token for backwards compatibility with boto2`);
  config[options.outputProfile].aws_security_token = credentials.SessionToken;

  // Preserve comments and structure of the original file
  // This is a simplified approach as the ini package doesn't preserve comments like configupdater in Python
  // For a more complete solution, a custom parser would be needed
  try {
    // Read the existing file to get its content with comments
    let existingContent = "";
    try {
      debug(`Reading existing credentials file content for reference`);
      existingContent = fs.readFileSync(credFile, "utf-8");
    } catch (err) {
      debug(`No existing credentials file found: ${(err as Error).message}`);
    }

    // Create the directory if it doesn't exist
    const credFileDir = path.dirname(credFile);
    if (!fs.existsSync(credFileDir)) {
      debug(`Creating credentials directory: ${credFileDir}`);
      fs.mkdirSync(credFileDir, { recursive: true });
    }

    // Write the updated config
    debug(`Writing updated configuration to credentials file`);
    fs.writeFileSync(credFile, ini.stringify(config));
    debug(`Credentials file successfully updated`);

    // Format expiration date
    const expirationDate = new Date(credentials.Expiration);
    const formattedExpiration = expirationDate.toLocaleString();

    console.log(
      boxen(
        chalk.green(
          `✓ Temporary credentials have been written to ${chalk.bold(
            credFile,
          )}\n`,
        ) +
          chalk.green(
            `✓ Profile: ${chalk.bold(`[${options.outputProfile}]`)}\n`,
          ) +
          chalk.yellow(`⏰ Expires: ${chalk.bold(formattedExpiration)}`),
        {
          padding: 1,
          margin: 1,
          borderColor: "green",
          borderStyle: "round",
          title: "Success",
          titleAlignment: "center",
        },
      ),
    );
  } catch (err) {
    debug(`Error writing to credentials file: ${(err as Error).message}`);
    console.error(
      boxen(
        chalk.red(
          `Error writing to credentials file: ${(err as Error).message}`,
        ),
        {
          padding: 1,
          margin: 1,
          borderColor: "red",
          borderStyle: "round",
          title: "Error",
          titleAlignment: "center",
        },
      ),
    );
    process.exit(1);
  }
} catch (err) {
  debug(`Error occurred: ${(err as Error).message}`);
  console.error(
    boxen(chalk.red(`Error: ${(err as Error).message}`), {
      padding: 1,
      margin: 1,
      borderColor: "red",
      borderStyle: "round",
      title: "Error",
      titleAlignment: "center",
    }),
  );
  process.exit(1);
}
