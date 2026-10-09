"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _vecks = require("vecks");
var _colors = _interopRequireDefault(require("./util/colors"));
var _denormalise = _interopRequireWildcard(require("./denormalise"));
var _entityToPolyline = _interopRequireDefault(require("./entityToPolyline"));
var _applyTransforms = _interopRequireDefault(require("./applyTransforms"));
var _logger = _interopRequireDefault(require("./util/logger"));
var _dict = require("./util/dict");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != _typeof(e) && "function" != typeof e) return { "default": e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n["default"] = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
var _default = exports["default"] = function _default(parsed, limits) {
  var entities = (0, _denormalise["default"])(parsed, limits);
  // The points drawn for copies made by block insertion are counted against the same limit, since a
  // circle becomes dozens of them; those of entities written directly in the file are bounded by its size.
  var _resolveLimits = (0, _denormalise.resolveLimits)(limits),
    maxEntities = _resolveLimits.maxEntities;
  var points = 0;
  var polylines = entities.map(function (entity) {
    var layerTable = (0, _dict.own)(parsed.tables.layers, entity.layer);
    var colorNumber = 0;
    if ('colorNumber' in entity) {
      colorNumber = entity.colorNumber;
    } else if (layerTable) {
      colorNumber = layerTable.colorNumber;
    }
    if (_colors["default"][colorNumber] === undefined) {
      _logger["default"].warn('Color index', colorNumber, 'invalid, defaulting to black');
      colorNumber = 0;
    }
    var outline = (0, _entityToPolyline["default"])(entity);
    if (entity.transforms && entity.transforms.length) {
      points += outline.length;
      if (points > maxEntities) throw (0, _denormalise.tooMany)(maxEntities);
    }
    return {
      rgb: _colors["default"][colorNumber],
      layer: layerTable,
      vertices: (0, _applyTransforms["default"])(outline, entity.transforms)
    };
  });
  var bbox = new _vecks.Box2();
  polylines.forEach(function (polyline) {
    polyline.vertices.forEach(function (vertex) {
      bbox.expandByPoint({
        x: vertex[0],
        y: vertex[1]
      });
    });
  });
  return {
    bbox: bbox,
    polylines: polylines
  };
};