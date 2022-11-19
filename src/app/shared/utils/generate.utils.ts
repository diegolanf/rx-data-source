/**
 * Returns an array of the given callback function.
 *
 * @param mapping - Callback function to be executed for each element of the array.
 * @param size - Array's size.
 */
export const generateArray = <T>(mapping: (index: number) => T, size: number): T[] =>
  Array(size)
    .fill(0)
    .map((_: unknown, i: number) => mapping(i));
