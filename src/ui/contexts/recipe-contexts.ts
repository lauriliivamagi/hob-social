import { createContext } from '@lit/context';

export const i18nContext = createContext<Record<string, any>>('i18n');
export const scaleFactorContext = createContext<number>('scaleFactor');
