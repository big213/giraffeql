import { GiraffeqlBaseError } from "../classes";
import { getParams } from "..";
import { GiraffeqlResponse } from "../types";

export function generateErrorResponse(
  error: GiraffeqlBaseError
): GiraffeqlResponse {
  return generateGiraffeqlResponse(null, error);
}

export function generateNormalResponse(data: any): GiraffeqlResponse {
  return generateGiraffeqlResponse(data);
}

function generateGiraffeqlResponse(
  data: any,
  error?: GiraffeqlBaseError
): GiraffeqlResponse {
  return {
    data: data,
    ...(error && {
      error: {
        message: error.message,
        type: error.name,
        fieldPath: error.fieldPath ?? null,
        ...(getParams().debug && { stack: error.stack }),
      },
    }),
  };
}
