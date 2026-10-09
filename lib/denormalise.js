"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.tooMany = exports.resolveLimits = exports["default"] = exports.DEFAULT_LIMITS = void 0;
var _cloneDeep = _interopRequireDefault(require("lodash/cloneDeep"));
var _logger = _interopRequireDefault(require("./util/logger"));
var _dict = _interopRequireDefault(require("./util/dict"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
// Limits on flattening, since a file decides how deeply its blocks nest and how wide its arrays are.
// Entities written directly in the file are bounded by the file's size and are not counted. What block
// insertion produces is, as it is produced: every value each copied entity carries (coordinates,
// vertices, control points, hatch outlines and the rest) plus the placing steps it carries, one for every
// array place, and one for every INSERT, including those that will be skipped. A top-level insert whose
// whole expansion is estimated past the limit is refused before any of it is produced. A block nested
// deeper than `maxDepth` inserts, or one that inserts itself, is skipped; past `maxEntities` units,
// flattening throws an Error with code DXF_TOO_MANY_ENTITIES.
// `maxSvgLength` bounds toSVG's output, in characters, under the longest string a JavaScript engine
// will build.
var DEFAULT_LIMITS = exports.DEFAULT_LIMITS = {
  maxDepth: 64,
  maxEntities: 20000000,
  maxSvgLength: 500000000
};

// The error thrown when flattening, or what is drawn from it, would pass `max`.
var tooMany = exports.tooMany = function tooMany(max) {
  return Object.assign(new Error("DXF expands to too many entities (more than ".concat(max, ")")), {
    code: 'DXF_TOO_MANY_ENTITIES'
  });
};

// A limit as given, or the default when it is missing or not a non-negative number.
var limitOr = function limitOr(value, fallback) {
  return typeof value === 'number' && value >= 0 ? value : fallback;
};

// The limits to apply: each one given, or its default.
var resolveLimits = exports.resolveLimits = function resolveLimits(limits) {
  return {
    maxDepth: limitOr((limits || {}).maxDepth, DEFAULT_LIMITS.maxDepth),
    maxEntities: limitOr((limits || {}).maxEntities, DEFAULT_LIMITS.maxEntities),
    maxSvgLength: limitOr((limits || {}).maxSvgLength, DEFAULT_LIMITS.maxSvgLength)
  };
};

// An array count as a whole number of at least one; anything else counts as one.
var arrayCount = function arrayCount(n) {
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
};

// How many values an entity carries, nested ones included: what copying it costs.
var _size = function size(value) {
  if (value === null || _typeof(value) !== 'object') return 1;
  var n = 1;
  for (var _i = 0, _Object$keys = Object.keys(value); _i < _Object$keys.length; _i++) {
    var key = _Object$keys[_i];
    n += _size(value[key]);
  }
  return n;
};
var _default = exports["default"] = function _default(parseResult, limits) {
  var _resolveLimits = resolveLimits(limits),
    maxDepth = _resolveLimits.maxDepth,
    maxEntities = _resolveLimits.maxEntities;
  // Each block entity's size, worked out once however many times it is copied or costed.
  var sizes = new WeakMap();
  var sizeOf = function sizeOf(e) {
    if (!sizes.has(e)) sizes.set(e, _size(e));
    return sizes.get(e);
  };
  var blocksByName = parseResult.blocks.reduce(function (acc, b) {
    acc[b.name] = b;
    return acc;
  }, (0, _dict["default"])());

  // AN ESTIMATE of what one placement of a block costs when its contents land `depth` inserts deep: its
  // nested inserts expanded in full, as far as maxDepth lets them go, an insert that will be skipped
  // counting one. Worked out once per block and depth, so the recursion is never deeper than maxDepth.
  // Being remembered, it can be wrong for a block that inserts its own ancestors; it only refuses early,
  // and what is actually produced is counted as well.
  var expansions = new Map();
  var expanding = new Set();
  var _expansion = function expansion(block, depth) {
    var key = "".concat(depth);
    if (!expansions.has(block)) expansions.set(block, new Map());
    var known = expansions.get(block);
    if (known.has(key)) return known.get(key);
    expanding.add(block);
    var total = 0;
    var _iterator = _createForOfIteratorHelper(block.entities || []),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var e = _step.value;
        if (e.type !== 'INSERT') {
          total += sizeOf(e);
          continue;
        }
        var target = blocksByName[e.block];
        total += 1;
        if (target && !expanding.has(target) && depth < maxDepth) {
          total += arrayCount(e.rowCount) * arrayCount(e.columnCount) * _expansion(target, depth + 1);
        }
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
    expanding["delete"](block);
    var cost = Math.max(1, total);
    known.set(key, cost);
    return cost;
  };

  // The blocks being inserted along the current path, so one that inserts itself is caught.
  var inserting = new Set();
  var work = 0;
  var spend = function spend(units) {
    work += units;
    if (work > maxEntities) throw tooMany(maxEntities);
  };
  // Refuses work that would pass the limit, without counting it: it is counted as it is done.
  var affordable = function affordable(units) {
    if (work + units > maxEntities) throw tooMany(maxEntities);
  };
  // Missing blocks already reported, so a file inserting one many times logs it once.
  var missing = new Set();
  var out = [];
  var _gatherEntities = function gatherEntities(entities, transforms) {
    var topLevel = transforms.length === 0;
    entities.forEach(function (e) {
      if (e.type === 'INSERT') {
        var _insert$rowSpacing, _insert$columnSpacing, _insert$rotation;
        var insert = e;
        // Every insert costs, skipped or not, so a file of skipped inserts cannot run on unbounded. One
        // inside a block was counted when the block was copied.
        if (topLevel) spend(1);
        var block = blocksByName[insert.block];
        if (!block) {
          if (!missing.has(insert.block)) {
            missing.add(insert.block);
            _logger["default"].error('no block found for insert. block:', insert.block);
          }
          return;
        }
        if (inserting.has(insert.block)) {
          _logger["default"].warn('block inserts itself, skipped:', insert.block);
          return;
        }
        if (transforms.length >= maxDepth) {
          _logger["default"].warn('blocks nested deeper than', maxDepth, 'skipped at:', insert.block);
          return;
        }
        var rowCount = arrayCount(insert.rowCount);
        var columnCount = arrayCount(insert.columnCount);
        // Every place in the array costs one, even for a block with nothing in it.
        spend(rowCount * columnCount);
        // A top-level insert estimated past the limit is refused before any of it is produced.
        if (topLevel) affordable(rowCount * columnCount * _expansion(block, 1));
        var rowSpacing = (_insert$rowSpacing = insert.rowSpacing) !== null && _insert$rowSpacing !== void 0 ? _insert$rowSpacing : 0;
        var columnSpacing = (_insert$columnSpacing = insert.columnSpacing) !== null && _insert$columnSpacing !== void 0 ? _insert$columnSpacing : 0;
        var rotation = (_insert$rotation = insert.rotation) !== null && _insert$rotation !== void 0 ? _insert$rotation : 0;

        // It appears that the rectangular array is affected by rotation, but NOT by scale.
        var rowVec, colVec;
        if (rowCount > 1 || columnCount > 1) {
          var cos = Math.cos(rotation * Math.PI / 180);
          var sin = Math.sin(rotation * Math.PI / 180);
          rowVec = {
            x: -sin * rowSpacing,
            y: cos * rowSpacing
          };
          colVec = {
            x: cos * columnSpacing,
            y: sin * columnSpacing
          };
        } else {
          rowVec = {
            x: 0,
            y: 0
          };
          colVec = {
            x: 0,
            y: 0
          };
        }

        // For rectangular arrays, add the block entities for each location in the array
        for (var r = 0; r < rowCount; r++) {
          var _loop = function _loop() {
            // Adjust insert transform by row and column for rectangular arrays
            var t = {
              x: insert.x + rowVec.x * r + colVec.x * c,
              y: insert.y + rowVec.y * r + colVec.y * c,
              scaleX: insert.scaleX,
              scaleY: insert.scaleY,
              scaleZ: insert.scaleZ,
              extrusionX: insert.extrusionX,
              extrusionY: insert.extrusionY,
              extrusionZ: insert.extrusionZ,
              rotation: insert.rotation
            };
            // Add the insert transform and recursively add entities
            var transforms2 = transforms.slice(0);
            transforms2.push(t);

            // Use the insert layer
            var blockEntities = (block.entities || []).map(function (be) {
              // Each copy costs what it carries, and the placing steps it carries with it.
              spend(be.type === 'INSERT' ? 1 : sizeOf(be) + transforms2.length);
              var be2 = (0, _cloneDeep["default"])(be);
              be2.layer = insert.layer;
              // https://github.com/bjnortier/dxf/issues/52
              // See Issue 52. If we don't modify the
              // entity coordinates here it creates an issue with the
              // transformation matrices (which are only applied AFTER
              // block insertion modifications has been applied).
              switch (be2.type) {
                case 'LINE':
                  {
                    be2.start.x -= block.x;
                    be2.start.y -= block.y;
                    be2.end.x -= block.x;
                    be2.end.y -= block.y;
                    break;
                  }
                case 'LWPOLYLINE':
                case 'POLYLINE':
                  {
                    be2.vertices.forEach(function (v) {
                      v.x -= block.x;
                      v.y -= block.y;
                    });
                    break;
                  }
                case 'CIRCLE':
                case 'ELLIPSE':
                case 'ARC':
                  {
                    be2.x -= block.x;
                    be2.y -= block.y;
                    break;
                  }
                case 'SPLINE':
                  {
                    be2.controlPoints.forEach(function (cp) {
                      cp.x -= block.x;
                      cp.y -= block.y;
                    });
                    break;
                  }
              }
              return be2;
            });
            inserting.add(insert.block);
            try {
              _gatherEntities(blockEntities, transforms2);
            } finally {
              inserting["delete"](insert.block);
            }
          };
          for (var c = 0; c < columnCount; c++) {
            _loop();
          }
        }
      } else {
        // Top-level entity. Clone and add the transforms
        // The transforms are reversed so they occur in
        // order of application - i.e. the transform of the
        // top-level insert is applied last
        var e2 = (0, _cloneDeep["default"])(e);
        e2.transforms = transforms.slice().reverse();
        out.push(e2);
      }
    });
  };
  _gatherEntities(parseResult.entities, []);
  return out;
};