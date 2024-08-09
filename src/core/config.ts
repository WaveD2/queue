import dotenv from 'dotenv';
import { ConfigError } from '../utils/error';

dotenv.config();

export function getConfig(key: string): string {
    const value = process.env[key];
    if (value === undefined) {
        throw new ConfigError(`Error key "${key}" is not defined`);
    }
    return value;
}
