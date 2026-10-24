/** next-intl treats "." as nesting, so action names are stored with "_" in message files. */
export const actionKey = (action: string) => `activity.actions.${action.replace(/\./g, "_")}`;
