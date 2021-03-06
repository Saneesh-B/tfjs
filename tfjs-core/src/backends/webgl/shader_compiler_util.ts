/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as util from '../../util';

/**
 * Produces GLSL code that derives logical coordinates from a flat
 * index. The code performs integer division with each stride and decrements
 * the index until the index equals the final dimension coordinate.
 */
export function getLogicalCoordinatesFromFlatIndex(
    coords: string[], shape: number[], index = 'index'): string {
  const strides = util.computeStrides(shape);
  return strides
      .map((stride, i) => {
        let l0 = '';
        if (stride > 65535) {
           l0 = `int idx${i}1 = 65535; int idx${i}2 = ${stride - 65535};`;
        } else {
            l0 = `int idx${i}1 = ${stride}; int idx${i}2 = 0;`;
        }
        const line1 = `int ${coords[i]} = ${index} / (idx${i}1 + idx${i}2)`;
        const line2 = i === strides.length - 1 ?
            `int ${coords[i + 1]} = ${index} - ${coords[i]} * (idx${i}1 + idx${i}2)` :
            `index -= ${coords[i]} * (idx${i}1 + idx${i}2)`;
        return `${l0};\n${line1};\n${line2};\n`;
      })
      .join('');
}

function buildVec(x: string[]): string {
  if (x.length === 1) {
    return `${x[0]}`;
  }
  return `vec${x.length}(${x.join(',')})`;
}

/**
 * Produces GLSL code that computes the dot product of the input x and y
 * vectors. Handles splitting inputs into increments of vec4s when necessary.
 */
export function dotify(x: string[], y: string[]): string {
  if (x.length !== y.length) {
    throw new Error(
        `Vectors to be dotted must be of the same length -` +
        `got ${x.length} and ${y.length}`);
  }

  const slices: string[] = [];
  const nearestVec4 = Math.floor(x.length / 4);
  const nearestVec4Remainder = x.length % 4;

  for (let i = 0; i < nearestVec4; i++) {
    const xSlice = x.slice(i * 4, i * 4 + 4);
    const ySlice = y.slice(i * 4, i * 4 + 4);
    slices.push(`${buildVec(xSlice)}, ${buildVec(ySlice)}`);
  }

  if (nearestVec4Remainder !== 0) {
    let xSlice = x.slice(nearestVec4 * 4);
    let ySlice = y.slice(nearestVec4 * 4);
    if (xSlice.length === 1) {
      xSlice = xSlice.map(d => `float(${d})`);
      ySlice = ySlice.map(d => `float(${d})`);
    }
    slices.push(`${buildVec(xSlice)}, ${buildVec(ySlice)}`);
  }

  return slices.map((d, i) => `dot(${d})`).join('+');
}

/**
 * Produces GLSL that computes the flat index from 3D coordinates.
 */
export function getFlatIndexFrom3D(shape: [number, number, number]): string {
  const strides = util.computeStrides(shape).map(d => d.toString());

    let l0 = '';
    const stride = parseInt(strides[0]);
    if (stride > 65535) {
        l0 = `int idx1 = 65535; int idx2 = ${stride - 65535};`;
    } else {
        l0 = `int idx1 = ${stride}; int idx2 = 0;`;
    }
  
  return `
  int getFlatIndex(ivec3 coords) {
    ${l0};
    return coords.x * (idx1 + idx2) + coords.y * ${strides[1]} + coords.z;
  }
`;
}

export const ENCODE_FLOAT_SNIPPET = `
  const float FLOAT_MAX = 1.70141184e38;
  const float FLOAT_MIN = 1.17549435e-38;

  lowp vec4 encode_float(highp float v) {
    if (isnan(v)) {
      return vec4(255, 255, 255, 255);
    }

    highp float av = abs(v);

    if(av < FLOAT_MIN) {
      return vec4(0.0, 0.0, 0.0, 0.0);
    } else if(v > FLOAT_MAX) {
      return vec4(0.0, 0.0, 128.0, 127.0) / 255.0;
    } else if(v < -FLOAT_MAX) {
      return vec4(0.0, 0.0,  128.0, 255.0) / 255.0;
    }

    highp vec4 c = vec4(0,0,0,0);

    highp float e = floor(log2(av));
    highp float m = exp2(fract(log2(av))) - 1.0;

    c[2] = floor(128.0 * m);
    m -= c[2] / 128.0;
    c[1] = floor(32768.0 * m);
    m -= c[1] / 32768.0;
    c[0] = floor(8388608.0 * m);

    highp float ebias = e + 127.0;
    c[3] = floor(ebias / 2.0);
    ebias -= c[3] * 2.0;
    c[2] += floor(ebias) * 128.0;

    c[3] += 128.0 * step(0.0, -v);

    return c / 255.0;
  }
`;
