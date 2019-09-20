import { Validation } from "@nosplatform/crypto";
import { SocketErrors } from "../../enums";

export const validate = (schema, data) => {
    const { error: validationError } = Validation.validator.validate(schema, data);

    if (validationError) {
        const error = new Error(`Data validation error : ${validationError}`);
        error.name = SocketErrors.Validation;

        throw error;
    }
};
