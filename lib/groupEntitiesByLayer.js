"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _dict = require("./util/dict");
var _default = exports["default"] = function _default(entities) {
  return entities.reduce(function (acc, entity) {
    var layer = entity.layer;
    if (!(0, _dict.own)(acc, layer)) {
      (0, _dict.define)(acc, layer, []);
    }
    acc[layer].push(entity);
    return acc;
  }, {});
};