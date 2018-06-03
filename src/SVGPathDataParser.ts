// Parse SVG PathData
// http://www.w3.org/TR/SVG/paths.html#PathDataBNF
import { Transform } from "stream";
import { SVGCommand, SVGPathData, TransformFunction } from "./SVGPathData";
import { TransformableSVG } from "./TransformableSVG";
// Private consts : Char groups
const WSP = [" ", "\t", "\r", "\n"];
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const SIGNS = ["-", "+"];
const EXPONENTS = ["e", "E"];
const DECPOINT = ["."];
const FLAGS = ["0", "1"];
const COMMA = [","];
const COMMANDS = [
  "m",
  "M",
  "z",
  "Z",
  "l",
  "L",
  "h",
  "H",
  "v",
  "V",
  "c",
  "C",
  "s",
  "S",
  "q",
  "Q",
  "t",
  "T",
  "a",
  "A",
];
export class SVGPathDataParser extends TransformableSVG {
  curCommand: any = undefined;
  state: number = SVGPathDataParser.STATE_COMMAS_WSPS;
  curNumber: string = "";
  constructor() {
    super();
  }
  finish(commands: SVGCommand[] = []) {
    this.parse(" ", commands);
    // Adding residual command
    if (this.curCommand) {
      throw new SyntaxError("Unterminated command at the path end.");
    }
    return commands;
  }
  parse(str: string, commands: SVGCommand[] = []) {
    for (let i = 0; i < str.length; i++) {
      // White spaces parsing
      if (
        this.state & SVGPathDataParser.STATE_WSP ||
        this.state & SVGPathDataParser.STATE_WSPS
      ) {
        if (-1 !== WSP.indexOf(str[i])) {
          this.state ^= this.state & SVGPathDataParser.STATE_WSP;
          // any space stops current number parsing
          if ("" !== this.curNumber) {
            this.state ^= this.state & SVGPathDataParser.STATE_NUMBER_MASK;
          } else {
            continue;
          }
        }
      }
      // Commas parsing
      if (
        this.state & SVGPathDataParser.STATE_COMMA ||
        this.state & SVGPathDataParser.STATE_COMMAS
      ) {
        if (-1 !== COMMA.indexOf(str[i])) {
          this.state ^= this.state & SVGPathDataParser.STATE_COMMA;
          // any comma stops current number parsing
          if ("" !== this.curNumber) {
            this.state ^= this.state & SVGPathDataParser.STATE_NUMBER_MASK;
          } else {
            continue;
          }
        }
      }
      // Numbers parsing : -125.25e-125
      if (this.state & SVGPathDataParser.STATE_NUMBER) {
        // Reading the sign
        if (
          (this.state & SVGPathDataParser.STATE_NUMBER_MASK) ===
          SVGPathDataParser.STATE_NUMBER
        ) {
          this.state |=
            SVGPathDataParser.STATE_NUMBER_INT |
            SVGPathDataParser.STATE_NUMBER_DIGITS;
          if (-1 !== SIGNS.indexOf(str[i])) {
            this.curNumber += str[i];
            continue;
          }
        }
        // Reading the exponent sign
        if (this.state & SVGPathDataParser.STATE_NUMBER_EXPSIGN) {
          this.state ^= SVGPathDataParser.STATE_NUMBER_EXPSIGN;
          this.state |= SVGPathDataParser.STATE_NUMBER_DIGITS;
          if (-1 !== SIGNS.indexOf(str[i])) {
            this.curNumber += str[i];
            continue;
          }
        }
        // Reading digits
        if (this.state & SVGPathDataParser.STATE_NUMBER_DIGITS) {
          if (-1 !== DIGITS.indexOf(str[i])) {
            this.curNumber += str[i];
            continue;
          }
          this.state ^= SVGPathDataParser.STATE_NUMBER_DIGITS;
        }
        // Ended reading left side digits
        if (this.state & SVGPathDataParser.STATE_NUMBER_INT) {
          this.state ^= SVGPathDataParser.STATE_NUMBER_INT;
          // if got a point, reading right side digits
          if (-1 !== DECPOINT.indexOf(str[i])) {
            this.curNumber += str[i];
            this.state |=
              SVGPathDataParser.STATE_NUMBER_FLOAT |
              SVGPathDataParser.STATE_NUMBER_DIGITS;
            continue;
            // if got e/E, reading the exponent
          } else if (-1 !== EXPONENTS.indexOf(str[i])) {
            this.curNumber += str[i];
            this.state |=
              SVGPathDataParser.STATE_NUMBER_EXP |
              SVGPathDataParser.STATE_NUMBER_EXPSIGN;
            continue;
          }
          // else we"re done with that number
          this.state ^= this.state & SVGPathDataParser.STATE_NUMBER_MASK;
        }
        // Ended reading decimal digits
        if (this.state & SVGPathDataParser.STATE_NUMBER_FLOAT) {
          this.state ^= SVGPathDataParser.STATE_NUMBER_FLOAT;
          // if got e/E, reading the exponent
          if (-1 !== EXPONENTS.indexOf(str[i])) {
            this.curNumber += str[i];
            this.state |=
              SVGPathDataParser.STATE_NUMBER_EXP |
              SVGPathDataParser.STATE_NUMBER_EXPSIGN;
            continue;
          }
          // else we"re done with that number
          this.state ^= this.state & SVGPathDataParser.STATE_NUMBER_MASK;
        }
        // Ended reading exponent digits
        if (this.state & SVGPathDataParser.STATE_NUMBER_EXP) {
          // we"re done with that number
          this.state ^= this.state & SVGPathDataParser.STATE_NUMBER_MASK;
        }
      }
      // New number
      if (this.curNumber) {
        // Horizontal move to command (x)
        if (this.state & SVGPathDataParser.STATE_HORIZ_LINE_TO) {
          if (undefined === this.curCommand) {
            commands.push({
              type: SVGPathData.HORIZ_LINE_TO,
              relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
              x: Number(this.curNumber),
            });
          } else {
            this.curCommand.x = Number(this.curNumber);
            commands.push(this.curCommand);
            this.curCommand = undefined;
          }
          this.state |= SVGPathDataParser.STATE_NUMBER;
          // Vertical move to command (y)
        } else if (this.state & SVGPathDataParser.STATE_VERT_LINE_TO) {
          if (undefined === this.curCommand) {
            commands.push({
              type: SVGPathData.VERT_LINE_TO,
              relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
              y: Number(this.curNumber),
            });
          } else {
            this.curCommand.y = Number(this.curNumber);
            commands.push(this.curCommand);
            this.curCommand = undefined;
          }
          this.state |= SVGPathDataParser.STATE_NUMBER;
          // Move to / line to / smooth quadratic curve to commands (x, y)
        } else if (
          this.state & SVGPathDataParser.STATE_MOVE_TO ||
          this.state & SVGPathDataParser.STATE_LINE_TO ||
          this.state & SVGPathDataParser.STATE_SMOOTH_QUAD_TO
        ) {
          if (undefined === this.curCommand) {
            this.curCommand = {
              type:
                this.state & SVGPathDataParser.STATE_MOVE_TO
                  ? SVGPathData.MOVE_TO
                  : this.state & SVGPathDataParser.STATE_LINE_TO
                    ? SVGPathData.LINE_TO
                    : SVGPathData.SMOOTH_QUAD_TO,
              relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
              x: Number(this.curNumber),
            };
          } else if (undefined === this.curCommand.x) {
            this.curCommand.x = Number(this.curNumber);
          } else {
            this.curCommand.y = Number(this.curNumber);
            commands.push(this.curCommand);
            this.curCommand = undefined;
            // Switch to line to state
            if (this.state & SVGPathDataParser.STATE_MOVE_TO) {
              this.state ^= SVGPathDataParser.STATE_MOVE_TO;
              this.state |= SVGPathDataParser.STATE_LINE_TO;
            }
          }
          this.state |= SVGPathDataParser.STATE_NUMBER;
          // Curve to commands (x1, y1, x2, y2, x, y)
        } else if (this.state & SVGPathDataParser.STATE_CURVE_TO) {
          if (undefined === this.curCommand) {
            this.curCommand = {
              type: SVGPathData.CURVE_TO,
              relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
              x1: Number(this.curNumber),
            };
          } else if (undefined === this.curCommand.x1) {
            this.curCommand.x1 = Number(this.curNumber);
          } else if (undefined === this.curCommand.y1) {
            this.curCommand.y1 = Number(this.curNumber);
          } else if (undefined === this.curCommand.x2) {
            this.curCommand.x2 = Number(this.curNumber);
          } else if (undefined === this.curCommand.y2) {
            this.curCommand.y2 = Number(this.curNumber);
          } else if (undefined === this.curCommand.x) {
            this.curCommand.x = Number(this.curNumber);
          } else if (undefined === this.curCommand.y) {
            this.curCommand.y = Number(this.curNumber);
            commands.push(this.curCommand);
            this.curCommand = undefined;
          }
          this.state |= SVGPathDataParser.STATE_NUMBER;
          // Smooth curve to commands (x1, y1, x, y)
        } else if (this.state & SVGPathDataParser.STATE_SMOOTH_CURVE_TO) {
          if (undefined === this.curCommand) {
            this.curCommand = {
              type: SVGPathData.SMOOTH_CURVE_TO,
              relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
              x2: Number(this.curNumber),
            };
          } else if (undefined === this.curCommand.x2) {
            this.curCommand.x2 = Number(this.curNumber);
          } else if (undefined === this.curCommand.y2) {
            this.curCommand.y2 = Number(this.curNumber);
          } else if (undefined === this.curCommand.x) {
            this.curCommand.x = Number(this.curNumber);
          } else if (undefined === this.curCommand.y) {
            this.curCommand.y = Number(this.curNumber);
            commands.push(this.curCommand);
            this.curCommand = undefined;
          }
          this.state |= SVGPathDataParser.STATE_NUMBER;
          // Quadratic bezier curve to commands (x1, y1, x, y)
        } else if (this.state & SVGPathDataParser.STATE_QUAD_TO) {
          if (undefined === this.curCommand) {
            this.curCommand = {
              type: SVGPathData.QUAD_TO,
              relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
              x1: Number(this.curNumber),
            };
          } else if (undefined === this.curCommand.x1) {
            this.curCommand.x1 = Number(this.curNumber);
          } else if (undefined === this.curCommand.y1) {
            this.curCommand.y1 = Number(this.curNumber);
          } else if (undefined === this.curCommand.x) {
            this.curCommand.x = Number(this.curNumber);
          } else if (undefined === this.curCommand.y) {
            this.curCommand.y = Number(this.curNumber);
            commands.push(this.curCommand);
            this.curCommand = undefined;
          }
          this.state |= SVGPathDataParser.STATE_NUMBER;
          // Elliptic arc commands (rX, rY, xRot, lArcFlag, sweepFlag, x, y)
        } else if (this.state & SVGPathDataParser.STATE_ARC) {
          if (undefined === this.curCommand) {
            this.curCommand = {
              type: SVGPathData.ARC,
              relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
              rX: Number(this.curNumber),
            };
          } else if (undefined === this.curCommand.rX) {
            if (0 > Number(this.curNumber)) {
              throw new SyntaxError(
                `Expected positive number, got "${
                  this.curNumber
                }" at index "${i}"`,
              );
            }
            this.curCommand.rX = Number(this.curNumber);
          } else if (undefined === this.curCommand.rY) {
            if (0 > Number(this.curNumber)) {
              throw new SyntaxError(
                `Expected positive number, got "${
                  this.curNumber
                }" at index "${i}"`,
              );
            }
            this.curCommand.rY = Number(this.curNumber);
          } else if (undefined === this.curCommand.xRot) {
            this.curCommand.xRot = Number(this.curNumber);
          } else if (undefined === this.curCommand.lArcFlag) {
            if (-1 === FLAGS.indexOf(this.curNumber)) {
              throw new SyntaxError(
                `Expected a flag, got "${this.curNumber}" at index "${i}"`,
              );
            }
            this.curCommand.lArcFlag = Number(this.curNumber);
          } else if (undefined === this.curCommand.sweepFlag) {
            if ("0" !== this.curNumber && "1" !== this.curNumber) {
              throw new SyntaxError(
                `Expected a flag, got "${this.curNumber}" at index "${i}"`,
              );
            }
            this.curCommand.sweepFlag = Number(this.curNumber);
          } else if (undefined === this.curCommand.x) {
            this.curCommand.x = Number(this.curNumber);
          } else if (undefined === this.curCommand.y) {
            this.curCommand.y = Number(this.curNumber);
            commands.push(this.curCommand);
            this.curCommand = undefined;
          }
          this.state |= SVGPathDataParser.STATE_NUMBER;
        }
        this.curNumber = "";
        // Continue if a white space or a comma was detected
        if (-1 !== WSP.indexOf(str[i]) || -1 !== COMMA.indexOf(str[i])) {
          continue;
        }
        // if a sign is detected, then parse the new number
        if (-1 !== SIGNS.indexOf(str[i])) {
          this.curNumber = str[i];
          this.state |=
            SVGPathDataParser.STATE_NUMBER_INT |
            SVGPathDataParser.STATE_NUMBER_DIGITS;
          continue;
        }
        // if the decpoint is detected, then parse the new number
        if (-1 !== DECPOINT.indexOf(str[i])) {
          this.curNumber = str[i];
          this.state |=
            SVGPathDataParser.STATE_NUMBER_FLOAT |
            SVGPathDataParser.STATE_NUMBER_DIGITS;
          continue;
        }
      }
      // End of a command
      if (-1 !== COMMANDS.indexOf(str[i])) {
        // Adding residual command
        if (undefined !== this.curCommand) {
          if (this.curCommand) {
            throw new SyntaxError(`Unterminated command at index ${i}.`);
          }
          commands.push(this.curCommand);
          this.curCommand = undefined;
          this.state ^= this.state & SVGPathDataParser.STATE_COMMANDS_MASK;
        }
      }
      // Detecting the next command
      this.state ^= this.state & SVGPathDataParser.STATE_COMMANDS_MASK;
      // Is the command relative
      if (str[i] === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_RELATIVE;
      } else {
        this.state ^= this.state & SVGPathDataParser.STATE_RELATIVE;
      }
      // Horizontal move to command
      if ("z" === str[i].toLowerCase()) {
        commands.push({
          type: SVGPathData.CLOSE_PATH,
        });
        this.state = SVGPathDataParser.STATE_COMMAS_WSPS;
        continue;
        // Horizontal move to command
      } else if ("h" === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_HORIZ_LINE_TO;
        this.curCommand = {
          type: SVGPathData.HORIZ_LINE_TO,
          relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
        };
        // Vertical move to command
      } else if ("v" === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_VERT_LINE_TO;
        this.curCommand = {
          type: SVGPathData.VERT_LINE_TO,
          relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
        };
        // Move to command
      } else if ("m" === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_MOVE_TO;
        this.curCommand = {
          type: SVGPathData.MOVE_TO,
          relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
        };
        // Line to command
      } else if ("l" === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_LINE_TO;
        this.curCommand = {
          type: SVGPathData.LINE_TO,
          relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
        };
        // Curve to command
      } else if ("c" === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_CURVE_TO;
        this.curCommand = {
          type: SVGPathData.CURVE_TO,
          relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
        };
        // Smooth curve to command
      } else if ("s" === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_SMOOTH_CURVE_TO;
        this.curCommand = {
          type: SVGPathData.SMOOTH_CURVE_TO,
          relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
        };
        // Quadratic bezier curve to command
      } else if ("q" === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_QUAD_TO;
        this.curCommand = {
          type: SVGPathData.QUAD_TO,
          relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
        };
        // Smooth quadratic bezier curve to command
      } else if ("t" === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_SMOOTH_QUAD_TO;
        this.curCommand = {
          type: SVGPathData.SMOOTH_QUAD_TO,
          relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
        };
        // Elliptic arc command
      } else if ("a" === str[i].toLowerCase()) {
        this.state |= SVGPathDataParser.STATE_ARC;
        this.curCommand = {
          type: SVGPathData.ARC,
          relative: !!(this.state & SVGPathDataParser.STATE_RELATIVE),
        };
        // Unkown command
      } else {
        throw new SyntaxError(
          `Unexpected character "${str[i]}" at index ${i}.`,
        );
      }
      // White spaces can follow a command
      this.state |=
        SVGPathDataParser.STATE_COMMAS_WSPS | SVGPathDataParser.STATE_NUMBER;
    }
    return commands;
  }

    /**
     * Return a wrapper around this parser which applies the transformation on parsed commands.
     */
  transform(transform: TransformFunction) {
    const result = Object.create(this, {
      parse: {
        value(chunk: string, commands: SVGCommand[] = []) {
          const parsedCommands = Object.getPrototypeOf(this).parse.call(this, chunk);
          for (const c of parsedCommands) {
            const cT = transform(c);
            if (Array.isArray(cT)) {
              commands.push(...cT);
            } else {
              commands.push(cT);
            }
          }
          return commands;
        },
      },
    });
    return result as this;
  }

  // Parsing states
  static readonly STATE_WSP = 1;
  static readonly STATE_WSPS = 2;
  static readonly STATE_COMMA = 4;
  static readonly STATE_COMMAS = 8;
  static readonly STATE_COMMAS_WSPS = SVGPathDataParser.STATE_WSP |
  SVGPathDataParser.STATE_WSPS |
  SVGPathDataParser.STATE_COMMA |
  SVGPathDataParser.STATE_COMMAS;
  static readonly STATE_NUMBER = 16;
  static readonly STATE_NUMBER_DIGITS = 32;
  static readonly STATE_NUMBER_INT = 64;
  static readonly STATE_NUMBER_FLOAT = 128;
  static readonly STATE_NUMBER_EXP = 256;
  static readonly STATE_NUMBER_EXPSIGN = 512;
  static readonly STATE_NUMBER_MASK = SVGPathDataParser.STATE_NUMBER |
  SVGPathDataParser.STATE_NUMBER_DIGITS |
  SVGPathDataParser.STATE_NUMBER_INT |
  SVGPathDataParser.STATE_NUMBER_EXP |
  SVGPathDataParser.STATE_NUMBER_FLOAT;
  static readonly STATE_RELATIVE = 1024;
  static readonly STATE_CLOSE_PATH = 2048; // Close path command (z/Z)
  static readonly STATE_MOVE_TO = 4096; // Move to command (m/M)
  static readonly STATE_LINE_TO = 8192; // Line to command (l/L=)
  static readonly STATE_HORIZ_LINE_TO = 16384; // Horizontal line to command (h/H)
  static readonly STATE_VERT_LINE_TO = 32768; // Vertical line to command (v/V)
  static readonly STATE_CURVE_TO = 65536; // Curve to command (c/C)
  static readonly STATE_SMOOTH_CURVE_TO = 131072; // Smooth curve to command (s/S)
  static readonly STATE_QUAD_TO = 262144; // Quadratic bezier curve to command (q/Q)
  static readonly STATE_SMOOTH_QUAD_TO = 524288; // Smooth quadratic bezier curve to command (t/T)
  static readonly STATE_ARC = 1048576; // Elliptic arc command (a/A)
  static readonly STATE_COMMANDS_MASK = SVGPathDataParser.STATE_CLOSE_PATH |
  SVGPathDataParser.STATE_MOVE_TO |
  SVGPathDataParser.STATE_LINE_TO |
  SVGPathDataParser.STATE_HORIZ_LINE_TO |
  SVGPathDataParser.STATE_VERT_LINE_TO |
  SVGPathDataParser.STATE_CURVE_TO |
  SVGPathDataParser.STATE_SMOOTH_CURVE_TO |
  SVGPathDataParser.STATE_QUAD_TO |
  SVGPathDataParser.STATE_SMOOTH_QUAD_TO |
  SVGPathDataParser.STATE_ARC;
}
