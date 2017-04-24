/* eslint new-cap: 0, no-mixed-operators: 0, max-len:0 */
'use strict';

// Transform SVG PathData
// http://www.w3.org/TR/SVG/paths.html#PathDataBNF

// a2c utility
const a2c = require('./a2c.js');

// Access to SVGPathData constructor
const SVGPathData = require('./SVGPathData.js');

// TransformStream inheritance required modules
const TransformStream = require('readable-stream').Transform;
const util = require('util');

const DEBUG_CHECK_NUMBERS = true;
function assertNumbers(...numbers) {
  if(DEBUG_CHECK_NUMBERS) {
    for(let i = 0; i < numbers.length; i++) {
      if('number' !== typeof numbers[i]) {
        throw new Error(`assertNumbers arguments[${i}] is not a number. ${typeof numbers[i]} == typeof ${numbers[i]}`);
      }
    }
  }
  return true;
}

// Inherit of transform stream
util.inherits(SVGPathDataTransformer, TransformStream);

function SVGPathDataTransformer(transformFunction) {
  // Ensure new were used
  if(!(this instanceof SVGPathDataTransformer)) {
    return new SVGPathDataTransformer(transformFunction);
  }

  // Parent constructor
  TransformStream.call(this, {
    objectMode: true,
  });

  // Transform function needed
  if('function' !== typeof transformFunction) {
    throw new Error('Please provide a transform callback to receive commands.');
  }
  this._transformer = transformFunction;
}

SVGPathDataTransformer.prototype._transform = function(commands, encoding, done) {

  if(!(commands instanceof Array)) {
    commands = [commands];
  }
  for(const command of commands) {
    this.push(this._transformer(command));
  }
  done();
};

// Predefined transforming functions
// Rounds commands values
SVGPathDataTransformer.ROUND = function roundGenerator(roundVal = 1e13) {
  assertNumbers(roundVal);
  function rf(val) { return Math.round(val * roundVal) / roundVal}
  return function round(command) {
    for (const prop of ['x1', 'y1', 'x2', 'y2','x','y']) {
      'undefined' !== typeof command[prop] && (command[prop] = rf(command[prop]));
    }
    'undefined' !== typeof command.x1 && (command.x1 = rf(command.x1));
    'undefined' !== typeof command.y1 && (command.y1 = rf(command.y1));

    'undefined' !== typeof command.x2 && (command.x2 = rf(command.x2));
    'undefined' !== typeof command.y2 && (command.y2 = rf(command.y2));

    'undefined' !== typeof command.x && (command.x = rf(command.x));
    'undefined' !== typeof command.y && (command.y = rf(command.y));

    return command;
  };
};

// Relative to absolute commands
SVGPathDataTransformer.TO_ABS = function toAbsGenerator() {
  return SVGPathDataTransformer.INFO(function (command, prevX, prevY) {
    if(command.relative) {
      // x1/y1 values
      if('undefined' !== typeof command.x1) {
        command.x1 += prevX;
      }
      if('undefined' !== typeof command.y1) {
        command.y1 += prevY;
      }
      // x2/y2 values
      if('undefined' !== typeof command.x2) {
        command.x2 += prevX;
      }
      if('undefined' !== typeof command.y2) {
        command.y2 += prevY;
      }
      // Finally x/y values
      if('undefined' !== typeof command.x) {
        command.x += prevX;
      }
      if('undefined' !== typeof command.y) {
        command.y += prevY;
      }
      command.relative = false;
    }
    return command;
  });
};

// Absolute to relative commands
SVGPathDataTransformer.TO_REL = function toRelGenerator() {
  return SVGPathDataTransformer.INFO(function (command, prevX, prevY) {
    if(!command.relative) {
      // x1/y1 values
      if('undefined' !== typeof command.x1) {
        command.x1 -= prevX;
      }
      if('undefined' !== typeof command.y1) {
        command.y1 -= prevY;
      }
      // x2/y2 values
      if('undefined' !== typeof command.x2) {
        command.x2 -= prevX;
      }
      if('undefined' !== typeof command.y2) {
        command.y2 -= prevY;
      }
      // Finally x/y values
      if('undefined' !== typeof command.x) {
        command.x -= prevX;
      }
      if('undefined' !== typeof command.y) {
        command.y -= prevY;
      }
      command.relative = true;
    }
    return command;
  });
};

// Convert H, V, Z and A with rX = 0 to L
SVGPathDataTransformer.NORMALIZE_HVZ =
  function normalizeHVZGenerator(normalizeZ = true, normalizeH = true, normalizeV = true) {
    return SVGPathDataTransformer.INFO(function (command, prevX, prevY, pathStartX, pathStartY) {
      if(isNaN(pathStartX) && !(command.type & SVGPathData.MOVE_TO)) {
        throw new Error('path must start with moveto');
      }
      if(normalizeH && command.type & SVGPathData.HORIZ_LINE_TO) {
        command.type = SVGPathData.LINE_TO;
        command.y = command.relative ? 0 : prevY;
      }
      if(normalizeV && command.type & SVGPathData.VERT_LINE_TO) {
        command.type = SVGPathData.LINE_TO;
        command.x = command.relative ? 0 : prevX;
      }
      if(normalizeZ && command.type & SVGPathData.CLOSE_PATH) {
        command.type = SVGPathData.LINE_TO;
        command.x = command.relative ? pathStartX - prevX : pathStartX;
        command.y = command.relative ? pathStartY - prevY : pathStartY;
      }
      if(command.type & SVGPathData.ARC && (0 === command.rX || 0 === command.rY)) {
        command.type = SVGPathData.LINE_TO;
        delete command.rX;
        delete command.rY;
        delete command.xRot;
        delete command.lArcFlag;
        delete command.sweepFlag;
      }
      return command;
    });
  };

/*
 * Transforms smooth curves and quads to normal curves and quads (SsTt to CcQq)
 */
SVGPathDataTransformer.NORMALIZE_ST = function normalizeCurvesGenerator() {
  let prevCurveC2X = NaN;
  let prevCurveC2Y = NaN;
  let prevQuadCX = NaN;
  let prevQuadCY = NaN;

  return SVGPathDataTransformer.INFO(function (command, prevX, prevY) {
    if(command.type & SVGPathData.SMOOTH_CURVE_TO) {
      command.type = SVGPathData.CURVE_TO;
      prevCurveC2X = isNaN(prevCurveC2X) ? prevX : prevCurveC2X;
      prevCurveC2Y = isNaN(prevCurveC2Y) ? prevY : prevCurveC2Y;
      command.x1 = command.relative ? prevX - prevCurveC2X : 2 * prevX - prevCurveC2X;
      command.y1 = command.relative ? prevY - prevCurveC2Y : 2 * prevY - prevCurveC2Y;
    }
    if(command.type & SVGPathData.CURVE_TO) {
      prevCurveC2X = command.relative ? prevX + command.x2 : command.x2;
      prevCurveC2Y = command.relative ? prevY + command.y2 : command.y2;
    } else {
      prevCurveC2X = NaN;
      prevCurveC2Y = NaN;
    }
    if(command.type & SVGPathData.SMOOTH_QUAD_TO) {
      command.type = SVGPathData.QUAD_TO;
      prevQuadCX = isNaN(prevQuadCX) ? prevX : prevQuadCX;
      prevQuadCY = isNaN(prevQuadCY) ? prevY : prevQuadCY;
      command.x1 = command.relative ? prevX - prevQuadCX : 2 * prevX - prevQuadCX;
      command.y1 = command.relative ? prevY - prevQuadCY : 2 * prevY - prevQuadCY;
    }
    if(command.type & SVGPathData.QUAD_TO) {
      prevQuadCX = command.relative ? prevX + command.x1 : command.x1;
      prevQuadCY = command.relative ? prevY + command.y1 : command.y1;
    } else {
      prevQuadCX = NaN;
      prevQuadCY = NaN;
    }

    return command;
  });
};

/*
 * A quadratic bézier curve can be represented by a cubic bézier curve which has
 * the same end points as the quadratic and both control points in place of the
 * quadratic's one.
 *
 * This transformer replaces QqTt commands with Cc commands respectively.
 * This is useful for reading path data into a system which only has a
 * representation for cubic curves.
 */
SVGPathDataTransformer.QT_TO_C = function qtToCGenerator() {
  let prevQuadX1 = NaN;
  let prevQuadY1 = NaN;

  return SVGPathDataTransformer.INFO(function (command, prevX, prevY) {
    if(command.type & SVGPathData.SMOOTH_QUAD_TO) {
      command.type = SVGPathData.QUAD_TO;
      prevQuadX1 = isNaN(prevQuadX1) ? prevX : prevQuadX1;
      prevQuadY1 = isNaN(prevQuadY1) ? prevY : prevQuadY1;
      command.x1 = command.relative ? prevX - prevQuadX1 : 2 * prevX - prevQuadX1;
      command.y1 = command.relative ? prevY - prevQuadY1 : 2 * prevY - prevQuadY1;
    }
    if(command.type & SVGPathData.QUAD_TO) {
      prevQuadX1 = command.relative ? prevX + command.x1 : command.x1;
      prevQuadY1 = command.relative ? prevY + command.y1 : command.y1;
      const x1 = command.x1;
      const y1 = command.y1;

      command.type = SVGPathData.CURVE_TO;
      command.x1 = ((command.relative ? 0 : prevX) * 2 + x1) / 3;
      command.y1 = ((command.relative ? 0 : prevY) * 2 + y1) / 3;
      command.x2 = (command.x * 2 + x1) / 3;
      command.y2 = (command.y * 2 + y1) / 3;
    } else {
      prevQuadX1 = NaN;
      prevQuadY1 = NaN;
    }

    return command;
  });
};
SVGPathDataTransformer.INFO = function (f) {
  let prevX = 0;
  let prevY = 0;
  let pathStartX = NaN;
  let pathStartY = NaN;

  return function transform(command) {
    if(isNaN(pathStartX) && !(command.type & SVGPathData.MOVE_TO)) {
      throw new Error('path must start with moveto');
    }

    const result = f(command, prevX, prevY, pathStartX, pathStartY)

    if(command.type & SVGPathData.CLOSE_PATH) {
      prevX = pathStartX;
      prevY = pathStartY;
    }

    'undefined' !== typeof command.x && (prevX = (command.relative ? prevX + command.x : command.x));
    'undefined' !== typeof command.y && (prevY = (command.relative ? prevY + command.y : command.y));

    if(command.type & SVGPathData.MOVE_TO) {
      pathStartX = prevX;
      pathStartY = prevY;
    }

    return result;
  };
};

/*
 * remove 0-length segments
 */
SVGPathDataTransformer.SANITIZE = function sanitizeGenerator(EPS = 0) {
  assertNumbers(EPS);
  let prevCurveC2X = NaN;
  let prevCurveC2Y = NaN;
  let prevQuadCX = NaN;
  let prevQuadCY = NaN;

  return SVGPathDataTransformer.INFO(function (command, prevX, prevY, pathStartX, pathStartY) {
    const abs = Math.abs;
    let skip = false;
    let x1Rel = 0;
    let y1Rel = 0;

    if(command.type & SVGPathData.SMOOTH_CURVE_TO) {
      x1Rel = isNaN(prevCurveC2X) ? 0 : prevX - prevCurveC2X;
      y1Rel = isNaN(prevCurveC2Y) ? 0 : prevY - prevCurveC2Y;
    }
    if(command.type & (SVGPathData.CURVE_TO | SVGPathData.SMOOTH_CURVE_TO)) {
      prevCurveC2X = command.relative ? prevX + command.x2 : command.x2;
      prevCurveC2Y = command.relative ? prevY + command.y2 : command.y2;
    } else {
      prevCurveC2X = NaN;
      prevCurveC2Y = NaN;
    }
    if(command.type & SVGPathData.SMOOTH_QUAD_TO) {
      prevQuadCX = isNaN(prevQuadCX) ? prevX : 2 * prevX - prevQuadCX;
      prevQuadCY = isNaN(prevQuadCY) ? prevY : 2 * prevY - prevQuadCY;
    } else if(command.type & SVGPathData.QUAD_TO) {
      prevQuadCX = command.relative ? prevX + command.x1 : command.x1;
      prevQuadCY = command.relative ? prevY + command.y1 : command.y2;
    } else {
      prevQuadCX = NaN;
      prevQuadCY = NaN;
    }

    if(command.type & SVGPathData.LINE_COMMANDS ||
      command.type & SVGPathData.ARC && (0 === command.rX || 0 === command.rY || !command.lArcFlag) ||
      command.type & SVGPathData.CURVE_TO || command.type & SVGPathData.SMOOTH_CURVE_TO ||
      command.type & SVGPathData.QUAD_TO || command.type & SVGPathData.SMOOTH_QUAD_TO) {
      const xRel = 'undefined' === typeof command.x ? 0 :
        (command.relative ? command.x : command.x - prevX);
      const yRel = 'undefined' === typeof command.y ? 0 :
        (command.relative ? command.y : command.y - prevY);

      x1Rel = !isNaN(prevQuadCX) ? prevQuadCX - prevX :
        'undefined' === typeof command.x1 ? x1Rel :
          command.relative ? command.x :
            command.x1 - prevX;
      y1Rel = !isNaN(prevQuadCY) ? prevQuadCY - prevY :
        'undefined' === typeof command.y1 ? y1Rel :
          command.relative ? command.y :
            command.y1 - prevY;

      const x2Rel = 'undefined' === typeof command.x2 ? 0 :
        (command.relative ? command.x : command.x2 - prevX);
      const y2Rel = 'undefined' === typeof command.y2 ? 0 :
        (command.relative ? command.y : command.y2 - prevY);

      if(abs(xRel) <= EPS && abs(yRel) <= EPS &&
        abs(x1Rel) <= EPS && abs(y1Rel) <= EPS &&
        abs(x2Rel) <= EPS && abs(y2Rel) <= EPS) {
        skip = true;
      }
    }

    if(command.type & SVGPathData.CLOSE_PATH) {
      if(abs(prevX - pathStartX) <= EPS && abs(prevY - pathStartY) <= EPS) {
        skip = true;
      }
    }

    return skip ? [] : command;
  });
};

// SVG Transforms : http://www.w3.org/TR/SVGTiny12/coords.html#TransformList
// Matrix : http://apike.ca/prog_svg_transform.html
// eslint-disable-next-line
// a c e
// b d f
SVGPathDataTransformer.MATRIX = function matrixGenerator(a, b, c, d, e, f) {
  assertNumbers(a, b, c, d, e, f);

  return SVGPathDataTransformer.INFO(function (command, prevX, prevY, pathStartX) {
    const origX1 = command.x1;
    const origX2 = command.x2;
    // if isNaN(pathStartX), then this is the first command, which is ALWAYS an
    // absolute MOVE_TO, regardless what the relative flag says
    const comRel = command.relative && !isNaN(pathStartX);
    const x = 'undefined' !== typeof command.x ? command.x : (comRel ? 0 : prevX);
    const y = 'undefined' !== typeof command.y ? command.y : (comRel ? 0 : prevY);

    if(command.type & SVGPathData.HORIZ_LINE_TO && b !== 0) {
      throw new Error('Cannot rotate H')
    }
    if(command.type & SVGPathData.VERT_LINE_TO && c !== 0) {
      throw new Error('Cannot rotate V')
    }

    if ('undefined' !== typeof command.x) {
      command.x = (command.x * a) + (y * c) + (comRel ? 0 : e);
    }
    if ('undefined' !== typeof command.y) {
      command.y = (x * b) + command.y * d + (comRel ? 0 : f);
    }
    if ('undefined' !== typeof command.x1) {
      command.x1 = command.x1 * a + command.y1 * c + (comRel ? 0 : e);
    }
    if ('undefined' !== typeof command.y1) {
      command.y1 = origX1 * b + command.y1 * d + (comRel ? 0 : f);
    }
    if ('undefined' !== typeof command.x2) {
      command.x2 = command.x2 * a + command.y2 * c + (comRel ? 0 : e);
    }
    if ('undefined' !== typeof command.y2) {
      command.y2 = origX2 * b + command.y2 * d + (comRel ? 0 : f);
    }
    const sq = function sq(x) { return x * x; }
    const det = a * d - b * c;

    if('undefined' !== typeof command.xRot) {
      // Skip if this is a pure translation
      if(1 !== a || 0 !== b || 0 !== c || 1 !== d) {
        // Special case for singular matrix
        if(0 === det) {
          // In the singular case, the arc is compressed to a line. The actual geometric image of the original
          // curve under this transform possibly extends beyond the starting and/or ending points of the segment, but
          // for simplicity we ignore this detail and just replace this command with a single line segment.
          delete command.rX;
          delete command.rY;
          delete command.xRot;
          delete command.lArcFlag;
          delete command.sweepFlag;
          command.type = SVGPathData.LINE_TO;
        } else {
          // Convert to radians
          const xRot = command.xRot * Math.PI / 180;

          // Convert rotated ellipse to general conic form
          // x0^2/rX^2 + y0^2/rY^2 - 1 = 0
          // x0 = x*cos(xRot) + y*sin(xRot)
          // y0 = -x*sin(xRot) + y*cos(xRot)
          // --> A*x^2 + B*x*y + C*y^2 - 1 = 0, where
          const sinRot = Math.sin(xRot);
          const cosRot = Math.cos(xRot);
          const xCurve = 1 / sq(command.rX);
          const yCurve = 1 / sq(command.rY);
          const A = sq(cosRot) * xCurve + sq(sinRot) * yCurve;
          const B = 2 * sinRot * cosRot * (xCurve - yCurve);
          const C = sq(sinRot) * xCurve + sq(cosRot) * yCurve;

          // Apply matrix to A*x^2 + B*x*y + C*y^2 - 1 = 0
          // x1 = a*x + c*y
          // y1 = b*x + d*y
          //      (we can ignore e and f, since pure translations don't affect the shape of the ellipse)
          // --> A1*x1^2 + B1*x1*y1 + C1*y1^2 - det^2 = 0, where
          const A1 = A * d * d - B * b * d + C * b * b;
          const B1 = B * (a * d + b * c) - 2 * (A * c * d + C * a * b);
          const C1 = A * c * c - B * a * c + C * a * a;

          // Unapply newXRot to get back to axis-aligned ellipse equation
          // x1 = x2*cos(newXRot) - y2*sin(newXRot)
          // y1 = x2*sin(newXRot) + y2*cos(newXRot)
          // A1*x1^2 + B1*x1*y1 + C1*y1^2 - det^2 =
          //   x2^2*(A1*cos(newXRot)^2 + B1*sin(newXRot)*cos(newXRot) + C1*sin(newXRot)^2)
          //   + x2*y2*(2*(C1 - A1)*sin(newXRot)*cos(newXRot) + B1*(cos(newXRot)^2 - sin(newXRot)^2))
          //   + y2^2*(A1*sin(newXRot)^2 - B1*sin(newXRot)*cos(newXRot) + C1*cos(newXRot)^2)
          //   (which must have the same zeroes as)
          // x2^2/newRX^2 + y2^2/newRY^2 - 1
          //   (so we have)
          // 2*(C1 - A1)*sin(newXRot)*cos(newXRot) + B1*(cos(newXRot)^2 - sin(newXRot)^2) = 0
          // (A1 - C1)*sin(2*newXRot) = B1*cos(2*newXRot)
          // 2*newXRot = atan2(B1, A1 - C1)
          const newXRot = ((Math.atan2(B1, A1 - C1) + Math.PI) % Math.PI) / 2;
          // For any integer n, (atan2(B1, A1 - C1) + n*pi)/2 is a solution to the above; incrementing n just swaps the
          // x and y radii computed below (since that's what rotating an ellipse by pi/2 does).  Choosing the rotation
          // between 0 and pi/2 eliminates the ambiguity and leads to more predictable output.

          // Finally, we get newRX and newRY from the same-zeroes relationship that gave us newXRot
          const newSinRot = Math.sin(newXRot);
          const newCosRot = Math.cos(newXRot);

          command.rX = Math.abs(det) / Math.sqrt(A1 * sq(newCosRot) + B1 * newSinRot * newCosRot + C1 * sq(newSinRot));
          command.rY = Math.abs(det) / Math.sqrt(A1 * sq(newSinRot) - B1 * newSinRot * newCosRot + C1 * sq(newCosRot));
          command.xRot = newXRot * 180 / Math.PI;
        }
      }
    }
    // sweepFlag needs to be inverted when mirroring shapes
    // see http://www.itk.ilstu.edu/faculty/javila/SVG/SVG_drawing1/elliptical_curve.htm
    // m 65,10 a 50,25 0 1 0 50,25
    // M 65,60 A 50,25 0 1 1 115,35
    if('undefined' !== typeof command.sweepFlag && det < 0) {
      command.sweepFlag = +!command.sweepFlag
    }
    return command;
  });
};

SVGPathDataTransformer.ROTATE = function rotateGenerator(a, x = 0, y = 0) {
  assertNumbers(a, x, y);
  const sin = Math.sin(a);
  const cos = Math.cos(a);

  return SVGPathDataTransformer.MATRIX(cos, sin, -sin, cos, x - x * cos + y * sin, y - x * sin - y * cos);
};

SVGPathDataTransformer.TRANSLATE = function translateGenerator(dX, dY = 0) {
  assertNumbers(dX, dY);
  return SVGPathDataTransformer.MATRIX(1, 0, 0, 1, dX, dY);
};

SVGPathDataTransformer.SCALE = function scaleGenerator(dX, dY = dX) {
  assertNumbers(dX, dY);
  return SVGPathDataTransformer.MATRIX(dX, 0, 0, dY, 0, 0);
};

SVGPathDataTransformer.SKEW_X = function skewXGenerator(a) {
  assertNumbers(a);
  return SVGPathDataTransformer.MATRIX(1, 0, Math.atan(a), 1, 0, 0);
};
SVGPathDataTransformer.SKEW_Y = function skewYGenerator(a) {
  assertNumbers(a);
  return SVGPathDataTransformer.MATRIX(1, Math.atan(a), 0, 1, 0, 0);
};

SVGPathDataTransformer.X_AXIS_SYMMETRY = function xSymmetryGenerator(xOffset = 0) {
  assertNumbers(xOffset);
  return SVGPathDataTransformer.MATRIX(-1, 0, 0, 1, xOffset, 0);
};

SVGPathDataTransformer.Y_AXIS_SYMMETRY = function ySymmetryGenerator(yOffset = 0) {
  assertNumbers(yOffset);
  return SVGPathDataTransformer.MATRIX(1, 0, 0, -1, 0, yOffset);
};

// Convert arc commands to curve commands
SVGPathDataTransformer.A_TO_C = function a2CGenerator() {
  return SVGPathDataTransformer.INFO(function (command, prevX, prevY) {
    if (SVGPathData.ARC === command.type) {
      const args = a2c(command.relative ? 0 : prevX, command.relative ? 0 : prevY,
        command.rX, command.rX,
        command.xRot, command.lArcFlag, command.sweepFlag,
        command.x, command.y);

      const commands = [];

      for (let i = 0; i < args.length; i += 6) {
        commands.push({
          type: SVGPathData.CURVE_TO,
          relative: command.relative,
          x1: args[i],
          y1: args[i + 1],
          x2: args[i + 2],
          y2: args[i + 3],
          x: args[i + 4],
          y: args[i + 5],
        });
      }
      return commands;
    }
    return command;
  });
};

module.exports = SVGPathDataTransformer;
