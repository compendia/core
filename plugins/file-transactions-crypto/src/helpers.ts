export class SetFileHelper {
    public static getKey(fullKey: string) {
        return fullKey.substr(fullKey.indexOf(".") + 1, fullKey.length);
    }

    public static isSchemaTransaction(key: string): boolean {
        return key.startsWith("schema.");
    }

    public static isDocTransaction(key: string): boolean {
        return key.startsWith("db.doc.");
    }
}
