export class GiraffeqlBaseError extends Error {
  name: string;
  fieldPath: string[];
  statusCode: number;

  constructor(params: {
    errorName?: string;
    message: string;
    fieldPath?: string[];
    statusCode?: number;
  }) {
    const {
      errorName = "GiraffeqlBaseError",
      message,
      fieldPath = [],
      statusCode = 500,
    } = params;
    super(errorName + ": " + message);
    this.name = errorName;
    this.fieldPath = fieldPath;
    this.statusCode = statusCode;
  }
}
