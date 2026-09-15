const Joi = require('joi');

function fieldSchema(def) {
  let base;
  switch (def.type) {
    case 'number': base = Joi.number(); break;
    case 'date': base = Joi.date(); break;
    default: base = Joi.string().trim();
  }
  if (def.required) {
    return base.required().messages({
      'any.required': `${def.label || def.key} is required`,
      'string.empty': `${def.label || def.key} is required`,
    });
  }
  return base.allow('', null).optional();
}

function buildSpecSchema(specFieldDefs = []) {
  const shape = {};
  for (const def of specFieldDefs) {
    if (!def?.key) continue;
    shape[def.key] = fieldSchema(def);
  }
  return Joi.object(shape).unknown(false);
}

function mergeSpecFieldDefs(categoryFields = [], subcategoryFields = []) {
  const map = new Map();
  for (const f of categoryFields) map.set(f.key, f);
  for (const f of subcategoryFields) map.set(f.key, f);
  return Array.from(map.values());
}

function validateSpecifications(specFieldDefs, specifications) {
  const schema = buildSpecSchema(specFieldDefs);
  return schema.validate(specifications || {}, { abortEarly: false, stripUnknown: false });
}

module.exports = { buildSpecSchema, mergeSpecFieldDefs, validateSpecifications };