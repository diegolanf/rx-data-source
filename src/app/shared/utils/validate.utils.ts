/**
 * Validates if input is number.
 *
 * @param input - Input to be validated.
 */
export const isNumber = (input: unknown): input is number => typeof input === 'number';
