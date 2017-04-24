'use strict';

function SVGPathData(content) {
  this.commands = SVGPathData.parse(content);
}

SVGPathData.prototype.encode = function() {
  return SVGPathData.encode(this.commands);
};

SVGPathData.prototype.round = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.ROUND].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.toAbs = function() {
  return this.transform(SVGPathData.Transformer.TO_ABS);
};

SVGPathData.prototype.toRel = function() {
  return this.transform(SVGPathData.Transformer.TO_REL);
};

SVGPathData.prototype.normalizeHVZ = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.NORMALIZE_HVZ].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.normalizeST = function() {
  return this.transform(SVGPathData.Transformer.NORMALIZE_ST);
};

SVGPathData.prototype.qtToC = function() {
  return this.transform(SVGPathData.Transformer.QT_TO_C);
};

SVGPathData.prototype.sanitize = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.SANITIZE].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.translate = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.TRANSLATE].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.scale = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.SCALE].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.rotate = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.ROTATE].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.matrix = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.MATRIX].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.skewX = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.SKEW_X].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.skewY = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.SKEW_Y].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.xSymmetry = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.X_AXIS_SYMMETRY].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.ySymmetry = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.Y_AXIS_SYMMETRY].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.aToC = function() {
  return this.transform.apply(this, [SVGPathData.Transformer.A_TO_C].concat(
    [].slice.call(arguments, 0)));
};

SVGPathData.prototype.transform = function(transformFunction) {
  let newCommands = [];
  let curCommands = [];
  const commands = this.commands;
  let i;
  let ii;

  transformFunction = transformFunction(...[].slice.call(arguments, 1));

  for(i = 0, ii = commands.length; i < ii; i++) {
    curCommands = transformFunction(commands[i]);
    if(curCommands instanceof Array) {
      newCommands = newCommands.concat(curCommands);
    } else {
      newCommands.push(curCommands);
    }
  }
  this.commands = newCommands;
  return this;
};

// Static methods
SVGPathData.encode = function(commands) {
  let content = '';
  const encoder = new SVGPathData.Encoder();

  encoder.on('readable', () => {
    let str;

    do {
      str = encoder.read();
      if(null !== str) {
        content += str;
      }
    } while(null !== str);
  });
  encoder.write(commands);
  encoder.end();
  return content;
};

SVGPathData.parse = function(content) {
  const commands = [];
  const parser = new SVGPathData.Parser();

  parser.on('readable', () => {
    let command;

    do {
      command = parser.read();
      if(null !== command) {
        commands.push(command);
      }
    } while(null !== command);
  });
  parser.write(content);
  parser.end();
  return commands;
};

// Commands static vars
SVGPathData.CLOSE_PATH = 1;
SVGPathData.MOVE_TO = 2;
SVGPathData.HORIZ_LINE_TO = 4;
SVGPathData.VERT_LINE_TO = 8;
SVGPathData.LINE_TO = 16;
SVGPathData.CURVE_TO = 32;
SVGPathData.SMOOTH_CURVE_TO = 64;
SVGPathData.QUAD_TO = 128;
SVGPathData.SMOOTH_QUAD_TO = 256;
SVGPathData.ARC = 512;
SVGPathData.LINE_COMMANDS =
  SVGPathData.LINE_TO | SVGPathData.HORIZ_LINE_TO | SVGPathData.VERT_LINE_TO;
SVGPathData.DRAWING_COMMANDS =
  SVGPathData.HORIZ_LINE_TO | SVGPathData.VERT_LINE_TO | SVGPathData.LINE_TO |
  SVGPathData.CURVE_TO | SVGPathData.SMOOTH_CURVE_TO | SVGPathData.QUAD_TO |
  SVGPathData.SMOOTH_QUAD_TO | SVGPathData.ARC;

// Export the main constructor first (tests fail otherwise)
module.exports = SVGPathData;

// Expose the internal constructors
SVGPathData.Parser = require('./SVGPathDataParser.js');
SVGPathData.Encoder = require('./SVGPathDataEncoder.js');
SVGPathData.Transformer = require('./SVGPathDataTransformer.js');
