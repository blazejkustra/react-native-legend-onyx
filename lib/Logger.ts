type Parameters =
  | string
  | Record<string, unknown>
  | Record<string, unknown>[]
  | Error;

type LogData = {
  message: string;
  level: "alert" | "info" | "hmmm";
  parameters?: Parameters;
};
type LoggerCallback = (data: LogData) => void;

let logger: LoggerCallback = () => {};

/**
 * Register the logging callback
 */
function registerLogger(callback: LoggerCallback) {
  logger = callback;
}

/**
 * Send an alert message to the logger
 */
function logAlert(message: string, parameters?: Parameters) {
  logger({ message: `[Onyx] ${message}`, level: "alert", parameters });
}

/**
 * Send an info message to the logger
 */
function logInfo(message: string, parameters?: Parameters) {
  logger({ message: `[Onyx] ${message}`, level: "info", parameters });
}

/**
 * Send an hmmm message to the logger
 */
function logHmmm(message: string, parameters?: Parameters) {
  logger({ message: `[Onyx] ${message}`, level: "hmmm", parameters });
}

export { logAlert, logHmmm, logInfo, registerLogger };
