/**
 * Who may use the Greenlight submission routes.
 *
 * **`greenlight` is the gate, not the organisation.** A caller needs a group named `greenlight`, or
 * `<organisation>:greenlight` — `labkoat:greenlight`, `konsol:greenlight` — so other organisations
 * can be let in without being made members of Labkoat. That is why these routes do not use
 * `awsJwtValidator`, which admits any group containing `labkoat` and nothing else.
 *
 * @namespace namespace:LabkoatApi.greenlightAccess
 */

/** A group name that opens the Greenlight routes. */
export const GREENLIGHT_GROUP = /^(?:[^:]+:)?greenlight$/;
