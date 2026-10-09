"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "DEFAULT_LIMITS", {
  enumerable: true,
  get: function get() {
    return _denormalise.DEFAULT_LIMITS;
  }
});
Object.defineProperty(exports, "Helper", {
  enumerable: true,
  get: function get() {
    return _Helper["default"];
  }
});
Object.defineProperty(exports, "colors", {
  enumerable: true,
  get: function get() {
    return _colors["default"];
  }
});
Object.defineProperty(exports, "config", {
  enumerable: true,
  get: function get() {
    return _config["default"];
  }
});
Object.defineProperty(exports, "denormalise", {
  enumerable: true,
  get: function get() {
    return _denormalise["default"];
  }
});
Object.defineProperty(exports, "groupEntitiesByLayer", {
  enumerable: true,
  get: function get() {
    return _groupEntitiesByLayer["default"];
  }
});
Object.defineProperty(exports, "parseString", {
  enumerable: true,
  get: function get() {
    return _parseString["default"];
  }
});
Object.defineProperty(exports, "toPolylines", {
  enumerable: true,
  get: function get() {
    return _toPolylines["default"];
  }
});
Object.defineProperty(exports, "toSVG", {
  enumerable: true,
  get: function get() {
    return _toSVG["default"];
  }
});
var _config = _interopRequireDefault(require("./config"));
var _parseString = _interopRequireDefault(require("./parseString"));
var _denormalise = _interopRequireWildcard(require("./denormalise"));
var _groupEntitiesByLayer = _interopRequireDefault(require("./groupEntitiesByLayer"));
var _toPolylines = _interopRequireDefault(require("./toPolylines"));
var _toSVG = _interopRequireDefault(require("./toSVG"));
var _colors = _interopRequireDefault(require("./util/colors"));
var _Helper = _interopRequireDefault(require("./Helper"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != _typeof(e) && "function" != typeof e) return { "default": e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n["default"] = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }