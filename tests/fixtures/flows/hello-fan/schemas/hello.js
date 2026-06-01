export const HELLO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    greeting: { type: 'string' },
  },
  required: ['name', 'greeting'],
}
