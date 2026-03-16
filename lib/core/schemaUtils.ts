import mongoose from 'mongoose';

/**
 * Return top-level schema keys for a Mongoose model (excluding __v and internal fields).
 */
export function getTopLevelSchemaKeys(Model: mongoose.Model<any>): string[] {
  const paths = Object.keys(Model.schema.paths || {});
  const topLevel = new Set<string>();

  for (const p of paths) {
    if (!p) continue;
    const top = (p.split('.')[0] || '');
    if (!top) continue;
    if (top === '__v' || top === 'id') continue;
    topLevel.add(top);
  }

  return Array.from(topLevel);
}

/**
 * Pick own properties from source that are defined in the model schema (top-level only).
 * Options:
 *  - exclude: keys to exclude from the result (useful for core fields handled separately)
 */
export function pickModelFields(Model: mongoose.Model<any>, source: any, options?: { exclude?: string[] }) {
  const result: Record<string, any> = {};
  if (!source || typeof source !== 'object') return result;

  const exclude = new Set(options?.exclude || []);
  const allowed = getTopLevelSchemaKeys(Model).filter(k => !exclude.has(k));

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  }

  return result;
}

export default { getTopLevelSchemaKeys, pickModelFields };
