"use strict";

import { vs, fs } from '/shaders.js';
import { parseOBJ, parseMTL } from '/parse.js';

async function main() {
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) {
    return;
  }

  // compiles and links the shaders, looks up attribute and uniform locations
  const meshProgramInfo = webglUtils.createProgramInfo(gl, [vs, fs]);

  const objHref = 'powerbankv2.obj';  
  const response = await fetch(objHref);
  const text = await response.text();
  const obj = parseOBJ(text);
  const baseHref = new URL(objHref, window.location.href);
  const matTexts = await Promise.all(obj.materialLibs.map(async filename => {
    const matHref = new URL(filename, baseHref).href;
    const response = await fetch(matHref);
    return await response.text();
  }));
  const materials = parseMTL(matTexts.join('\n'));

  const defaultMaterial = {
    diffuse: [1, 1, 1],
    ambient: [0, 0, 0],
    specular: [1, 1, 1],
    shininess: 400,
    opacity: 1,
  };

  const parts = obj.geometries.map(({material, data}) => {
    if (data.color) {
      if (data.position.length === data.color.length) {
        // it's 3. The our helper library assumes 4 so we need
        // to tell it there are only 3.
        data.color = { numComponents: 3, data: data.color };
      }
    } else {
      // there are no vertex colors so just use constant white
      data.color = { value: [1, 1, 1, 1] };
    }

    // create a buffer for each array by calling
    // gl.createBuffer, gl.bindBuffer, gl.bufferData
    const bufferInfo = webglUtils.createBufferInfoFromArrays(gl, data);
    return {
      material: materials[material] || defaultMaterial,
      bufferInfo,
    };
  });

  function getExtents(positions) {
    const min = positions.slice(0, 3);
    const max = positions.slice(0, 3);
    for (let i = 3; i < positions.length; i += 3) {
      for (let j = 0; j < 3; ++j) {
        const v = positions[i + j];
        min[j] = Math.min(v, min[j]);
        max[j] = Math.max(v, max[j]);
      }
    }
    return {min, max};
  }

  function getGeometriesExtents(geometries) {
    return geometries.reduce(({min, max}, {data}) => {
      const minMax = getExtents(data.position);
      return {
        min: min.map((min, ndx) => Math.min(minMax.min[ndx], min)),
        max: max.map((max, ndx) => Math.max(minMax.max[ndx], max)),
      };
    }, {
      min: Array(3).fill(Number.POSITIVE_INFINITY),
      max: Array(3).fill(Number.NEGATIVE_INFINITY),
    });
  }

  const extents = getGeometriesExtents(obj.geometries);
  const range = webglMath.subtractVectors(extents.max, extents.min);
  // amount to move the object so its center is at the origin
  const objOffset = webglMath.scaleVector(
      webglMath.addVectors(
        extents.min,
        webglMath.scaleVector(range, 0.5)),
      -1);
  const cameraTarget = [0, 0, 0];
  // figure out how far away to move the camera so we can likely
  // see the object.
  const radius = webglMath.length(range) * 1.2;
  const cameraPosition = webglMath.addVectors(cameraTarget, [
    0,
    0,
    radius,
  ]);
  
  const zNear = radius / 100;
  const zFar = radius * 3;

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }

  function render(time) {
    time *= 0.001;
    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = webglMath.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    const up = [0, 1, 0];
    // Compute the camera's matrix using look at.
    const camera = webglMath.lookAt(cameraPosition, cameraTarget, up);

    // Make a view matrix from the camera matrix.
    const view = webglMath.inverse(camera);

    const sharedUniforms = {
      u_lightDirection: webglMath.normalize([-1, 3, 5]),
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
      u_ambientLight: [0.2, 0.2, 0.2],
    };

    gl.useProgram(meshProgramInfo.program);

    webglUtils.setUniforms(meshProgramInfo, sharedUniforms);

    let u_world = webglMath.yRotation(time);

    // Tambahkan rotasi ke atas (sumbu X)
    const xRotation = webglMath.xRotation(Math.sin(time) * 0.5); // Rotasi berosilasi dengan waktu
    u_world = webglMath.multiply(xRotation, u_world);

    // Terjemahkan objek ke posisi yang sesuai
    u_world = webglMath.translate(u_world, ...objOffset);


    for (const {bufferInfo, material} of parts) {
      webglUtils.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
      
      // Prepare material uniforms
      const materialUniforms = {
        diffuse: material.diffuse || [1, 1, 1],
        ambient: material.ambient || [0, 0, 0],
        specular: material.specular || [1, 1, 1],
        shininess: material.shininess || 400,
        opacity: material.opacity || 1,
      };

      webglUtils.setUniforms(meshProgramInfo, {
        u_world,
        ...materialUniforms,
      });

      webglUtils.drawBufferInfo(gl, bufferInfo);
    }

    requestAnimationFrame(render);
  }
  
  requestAnimationFrame(render);
}

main().catch(console.error);

window.addEventListener('load', () => {
  if (window.webglUtils && window.webglMath) {
    main();
  } else {
    console.error('Required WebGL utility libraries are not loaded.');
  }
});

export default main;
