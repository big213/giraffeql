import {
  objectTypeDefs,
  rootResolvers,
  scalarTypeDefs,
  inputTypeDefs,
} from "..";
import {
  GiraffeqlObjectType,
  GiraffeqlScalarType,
  GiraffeqlInputType,
  GiraffeqlInputFieldType,
  GiraffeqlInputTypeLookup,
  GiraffeqlObjectTypeLookup,
} from "../classes";

import type { Params, ArrayOptions } from "../types";

function isNestedValue(
  ele: tsTypeFieldFinalValue | tsTypeFields
): ele is tsTypeFields {
  return ele.value instanceof Map;
}

type tsTypeFields = {
  value: Map<string, tsTypeFieldFinalValue | tsTypeFields>;
  description?: string;
};

type tsTypeFieldFinalValue = {
  value: string;
  arrayOptions?: ArrayOptions;
  isNullable: boolean;
  isOptional: boolean;
  description?: string;
};

export class TsSchemaGenerator {
  scaffoldStr: string = "";
  typeDocumentRoot: tsTypeFields = {
    value: new Map(),
  };
  scalarTsTypeFields: tsTypeFields = {
    value: new Map(),
    description: "All Scalar values",
  };
  inputTypeTsTypeFields: tsTypeFields = {
    value: new Map(),
    description: "All Input types",
  };
  mainTypesTsTypeFields: tsTypeFields = {
    value: new Map(),
    description: "All main types",
  };

  constructor({
    lookupValue = true,
    addQueryBuilder = true,
  }: {
    lookupValue?: boolean;
    addQueryBuilder?: boolean;
  } = {}) {
    const lookupString =
      typeof lookupValue === "string"
        ? `"${lookupValue}"`
        : String(lookupValue);

    if (addQueryBuilder) {
      this.scaffoldStr = `// Query builder (Typescript version >= 4.1.3 required)
const queryResult = executeGiraffeql({
  // Start typing here to get hints
  /* QUERY START */

  /* QUERY END */  
});

export function executeGiraffeql<Key extends keyof Root>(
  query: GetQuery<Key>
): GetResponse<Key> {
  let data: any;
  return data;
}`;
    }

    this.scaffoldStr += `
// scaffolding
export type GetQuery<K extends keyof Root> = K extends never
  ? Partial<Record<K, Queryize<Root[keyof Root]>>>
  : Record<K, Queryize<Root[K]>>;

export type GetResponse<K extends keyof Root> = Responseize<Root[K]>;

export type GetType<T> = Responseize<Field<T, undefined>>

type Primitive = string | number | boolean | undefined | null;

type Field<T, K> = {
  Type: T;
  Args: K;
};

type Responseize<T> = T extends Field<infer Type, infer Args>
  ? Type extends never
    ? never
    : Type extends (infer U)[]
    ? { [P in keyof U]: Responseize<U[P]> }[]
    : { [P in keyof Type]: Responseize<Type[P]> }
  : never;

type Queryize<T> = T extends Field<infer Type, infer Args>
  ? Type extends never
    ? never
    : Type extends Primitive
    ? Args extends undefined // Args is undefined
      ? LookupValue
      : Args extends [infer Arg]
      ? LookupValue | { __args: Arg } // Args is a tuple
      : { __args: Args }
    : Type extends (infer U)[]
    ? Queryize<Field<U, Args>>
    : Args extends undefined // Args is undefined
    ? { [P in keyof Type]?: Queryize<Type[P]> }
    : Args extends [infer Arg]
    ? { [P in keyof Type]?: Queryize<Type[P]> } & {
        __args?: Arg;
      }
    : { [P in keyof Type]?: Queryize<Type[P]> } & { __args: Args }
  : never;
  
type LookupValue = ${lookupString}\n\n`;
  }

  buildSchema() {
    // all scalars
    scalarTypeDefs.forEach((fieldDef, key) => {
      if (fieldDef instanceof GiraffeqlScalarType) {
        this.scalarTsTypeFields.value.set(fieldDef.definition.name, {
          value: fieldDef.definition.types.join("|"),
          isNullable: false,
          isOptional: false,
          description: fieldDef.definition.description,
        });
      }
    });

    this.typeDocumentRoot.value.set("Scalars", this.scalarTsTypeFields);

    this.typeDocumentRoot.value.set("InputTypes", this.inputTypeTsTypeFields);

    this.typeDocumentRoot.value.set("MainTypes", this.mainTypesTsTypeFields);

    // add main types
    objectTypeDefs.forEach((typeDef, typeDefKey) => {
      const capitalizedTypeDefKey = capitalizeString(typeDef.definition.name);
      const mainTypeFields = this.processTypeDefinition(typeDef);

      this.typeDocumentRoot.value.set(capitalizedTypeDefKey, mainTypeFields);

      const rootObject: tsTypeFields = {
        value: new Map(),
      };

      rootObject.value.set("Typename", {
        value: `"${typeDef.definition.name}"`,
        isNullable: false,
        isOptional: false,
      });

      rootObject.value.set("Type", {
        value: `GetType<${capitalizedTypeDefKey}>`,
        isNullable: false,
        isOptional: false,
      });

      this.mainTypesTsTypeFields.value.set(typeDef.definition.name, rootObject);
    });

    // add root resolvers -- must be added AFTER types
    const rootTypeFields: tsTypeFields = {
      value: new Map(),
      description: "All Root resolvers",
    };

    this.typeDocumentRoot.value.set("Root", rootTypeFields);

    rootResolvers.forEach((rootResolver, key) => {
      const rootObject: tsTypeFields = {
        value: new Map(),
        description: rootResolver.definition.description,
      };
      let fieldType = rootResolver.definition.type;

      // if string, attempt to convert to TypeDefinition
      if (fieldType instanceof GiraffeqlObjectTypeLookup) {
        const typeDef = objectTypeDefs.get(fieldType.name);
        if (!typeDef) {
          throw new Error(`TypeDef '${fieldType.name}' not found`);
        }
        fieldType = typeDef;
      }

      let typename;
      if (fieldType instanceof GiraffeqlObjectType) {
        typename = capitalizeString(fieldType.definition.name);
      } else {
        // if it is a scalarDefinition, look up in scalar Definition table

        typename = `Scalars['${fieldType.definition.name}']`;
      }

      // parse the argDefinitions
      const argReference = this.processInputFieldDefinition(
        rootResolver.definition.args
      );

      // add it as a tuple if it is not required
      if (
        rootResolver.definition.args &&
        !rootResolver.definition.args.definition.required
      )
        argReference.value = `[${argReference.value}]`;
      argReference.isOptional = false;

      rootObject.value.set("Type", {
        value: typename,
        arrayOptions: rootResolver.definition.arrayOptions,
        isNullable: rootResolver.definition.allowNull,
        isOptional: false,
      });

      rootObject.value.set("Args", argReference);

      rootTypeFields.value.set(key, rootObject);
    });
  }

  processTypeDefinition(typeDef: GiraffeqlObjectType) {
    const mainTypeFields: tsTypeFields = {
      value: new Map(),
      description: typeDef.definition.description,
    };
    Object.entries(typeDef.definition.fields).forEach(([field, fieldDef]) => {
      const rootObject: tsTypeFields = {
        value: new Map(),
        description: fieldDef.description,
      };

      let fieldType = fieldDef.type;
      let typename;
      let args;

      // if string, attempt to convert to TypeDefinition
      if (fieldType instanceof GiraffeqlObjectTypeLookup) {
        const lookupTypeDef = objectTypeDefs.get(fieldType.name);
        if (!lookupTypeDef) {
          throw new Error(`TypeDef '${fieldType.name}' not found`);
        }
        fieldType = lookupTypeDef;
      }

      // if field is hidden, set the typename to never
      if (fieldDef.hidden) {
        typename = "never";
        args = "undefined";
      } else if (fieldType instanceof GiraffeqlObjectType) {
        typename = capitalizeString(fieldType.definition.name);
      } else {
        // if it is a scalarDefinition, look up in scalar Definition table

        typename = `Scalars['${fieldType.definition.name}']`;
      }

      args = this.processInputFieldDefinition(fieldDef.args);
      // add it as a tuple if it is not required
      if (fieldDef.args && !fieldDef.args.definition.required)
        args.value = `[${args.value}]`;

      args.isOptional = false;

      rootObject.value.set("Type", {
        value: typename,
        arrayOptions: fieldDef.arrayOptions,
        isNullable: fieldDef.allowNull,
        isOptional: false,
        description: undefined,
      });

      rootObject.value.set("Args", args);

      mainTypeFields.value.set(field, rootObject);
    });

    return mainTypeFields;
  }

  processInputFieldDefinition(
    argDefinition: GiraffeqlInputFieldType | undefined
  ): tsTypeFieldFinalValue {
    let inputDefName;
    if (argDefinition) {
      let argDefType = argDefinition.definition.type;

      const inputTypeTypeFields: tsTypeFields = {
        value: new Map(),
      };

      // is lookup field? convert
      if (argDefType instanceof GiraffeqlInputTypeLookup) {
        const lookupInputType = inputTypeDefs.get(argDefType.name);

        if (!lookupInputType)
          throw new Error(
            `Deferred InputType lookup failed: '${argDefType.name}'`
          );

        argDefType = lookupInputType;
      }

      if (argDefType instanceof GiraffeqlInputType) {
        Object.entries(argDefType.definition.fields).forEach(
          ([key, argDef]) => {
            const finalValue = this.processInputFieldDefinition(argDef);
            inputTypeTypeFields.value.set(key, finalValue);
          }
        );
        const argDefName = argDefType.definition.name;

        if (!argDefName) throw new Error("At least 1 ArgDef is missing name");

        // add to type InputType if not exists
        if (!this.inputTypeTsTypeFields.value.has(argDefName)) {
          this.inputTypeTsTypeFields.value.set(argDefName, inputTypeTypeFields);
        }

        // update the argTypename
        inputDefName = `InputTypes['${argDefName}']`;
        inputTypeTypeFields.description = argDefType.definition.description;
      } else {
        // if it is a scalarDefinition, look up in input Definition table
        inputDefName = `Scalars['${argDefType.definition.name}']`;
      }
    }

    return {
      value: inputDefName ?? "undefined",
      arrayOptions: argDefinition?.definition.arrayOptions,
      isNullable: argDefinition?.definition.allowNull ?? false,
      isOptional: !argDefinition?.definition.required ?? false,
      description: undefined, // inputFieldType has no description
    };
  }

  outputSchema() {
    // build final TS document
    let typesStr = "";

    this.typeDocumentRoot.value.forEach((tsRootTypeValue, typename) => {
      // has description? if so, add jsdoc
      if (tsRootTypeValue.description)
        typesStr += `/**${tsRootTypeValue.description}*/`;
      typesStr +=
        `export type ${typename}=` +
        (isNestedValue(tsRootTypeValue)
          ? this.buildTsDocument(tsRootTypeValue)
          : `(${
              (tsRootTypeValue.value === ""
                ? "undefined"
                : tsRootTypeValue.value) +
              (tsRootTypeValue.arrayOptions?.allowNullElement ? "|null" : "") +
              ")" +
              (tsRootTypeValue.arrayOptions ? "[]" : "") +
              (tsRootTypeValue.isNullable ? "|null" : "")
            }`) +
        `\n`;
    });

    return this.scaffoldStr + typesStr;
  }

  buildTsDocument(tsTypeField: tsTypeFields) {
    let str = "{";
    tsTypeField.value.forEach((value, key) => {
      if (isNestedValue(value)) {
        if (value.description) str += `/**${value.description}*/`;
        // nested tsTypeField
        str += `"${key}":${this.buildTsDocument(value)};`;
      } else {
        // string value
        // has description? if so, add jsdoc
        if (value.description) str += `/**${value.description}*/`;
        str += `"${key}"${value.isOptional ? "?" : ""}:(${
          (value.value === "" ? "undefined" : value.value) +
          (value.arrayOptions?.allowNullElement ? "|null" : "") +
          ")" +
          (value.arrayOptions ? "[]" : "") +
          (value.isNullable ? "|null" : "")
        };`;
      }
    });
    str += "}";
    return str;
  }
}

function capitalizeString(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
