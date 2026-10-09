"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.own = exports.define = exports["default"] = void 0;
// Lookups keyed by names that come from the file: blocks, layers, styles, entity types. A name such as
// "__proto__" or "constructor" must behave as an ordinary key.
// An internal lookup, never handed to callers: no prototype, so no name reaches an inherited member.
var _default = exports["default"] = function _default() {
  return Object.create(null);
}; // Stores `value` under `key` as an own property, so "__proto__" is a key rather than a prototype change.
var define = exports.define = function define(obj, key, value) {
  return Object.defineProperty(obj, key, {
    value: value,
    enumerable: true,
    writable: true,
    configurable: true
  });
};

// The value stored under `key` itself, never one inherited from Object.prototype.
var own = exports.own = function own(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
};