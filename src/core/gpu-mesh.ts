import type { Point } from './model';

/** Batch the deformation cage in one GPU draw instead of hundreds of canvas clips. */
export class GpuMeshRenderer {
  readonly canvas = document.createElement('canvas');
  padding = 0;
  renderScale = 1;
  private gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private vertexArray = new Float32Array(0);
  private indices = new Uint16Array(0);
  private lastSource: HTMLCanvasElement | null = null;
  private lastVersion: number | undefined;
  private textureWidth = 0;
  private textureHeight = 0;
  private geometryKey = '';
  private sizeLocation: WebGLUniformLocation | null = null;
  private position = -1;
  private uv = -1;
  private disposed = false;

  constructor() {
    this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true, depth: false, stencil: false, powerPreference: 'high-performance' });
    const gl = this.gl;
    if (!gl) return;
    const shader = (type: number, code: string): WebGLShader | null => {
      const value = gl.createShader(type); if (!value) return null;
      gl.shaderSource(value, code); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) { gl.deleteShader(value); return null; }
      return value;
    };
    const vertex = shader(gl.VERTEX_SHADER, 'attribute vec2 a_position; attribute vec2 a_uv; uniform vec2 u_size; varying vec2 v_uv; void main(){ gl_Position=vec4(a_position.x/u_size.x*2.0-1.0,1.0-a_position.y/u_size.y*2.0,0.0,1.0);v_uv=a_uv; }');
    const fragment = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 v_uv; uniform sampler2D u_texture; void main(){gl_FragColor=texture2D(u_texture,v_uv);}');
    if (!vertex || !fragment) { if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment); this.gl = null; return; }
    const program = gl.createProgram();
    if (!program) { gl.deleteShader(vertex); gl.deleteShader(fragment); this.gl = null; return; }
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); this.gl = null; return; }
    this.program = program; this.vertexBuffer = gl.createBuffer(); this.indexBuffer = gl.createBuffer(); this.texture = gl.createTexture();
    this.position = gl.getAttribLocation(program, 'a_position'); this.uv = gl.getAttribLocation(program, 'a_uv'); this.sizeLocation = gl.getUniformLocation(program, 'u_size');
    gl.useProgram(program); gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  }

  render(source: HTMLCanvasElement, original: Point[][], distorted: Point[][], textureVersion?: number): HTMLCanvasElement | null {
    const gl = this.gl;
    if (!gl || this.disposed || gl.isContextLost() || !original.length || !original[0].length) return null;
    const rows = original.length - 1, columns = original[0].length - 1;
    this.padding = Math.ceil(Math.max(source.width, source.height) * 0.10);
    const scale = Math.max(0.25, Math.min(1, this.renderScale));
    const width = Math.round((source.width + this.padding * 2) * scale), height = Math.round((source.height + this.padding * 2) * scale);
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    const key = `${rows}:${columns}`;
    if (this.geometryKey !== key) {
      this.geometryKey = key; this.vertexArray = new Float32Array((rows + 1) * (columns + 1) * 4); this.indices = new Uint16Array(rows * columns * 6);
      let offset = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
        const a = r * (columns + 1) + c, b = a + 1, d = a + columns + 1, e = d + 1;
        this.indices.set([a, b, d, d, b, e], offset); offset += 6;
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);
    }
    let offset = 0;
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
      const p = distorted[r][c], uv = original[r][c];
      this.vertexArray[offset++] = (p.x + this.padding) * scale; this.vertexArray[offset++] = (p.y + this.padding) * scale;
      this.vertexArray[offset++] = uv.x / source.width; this.vertexArray[offset++] = uv.y / source.height;
    }
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer); gl.bufferData(gl.ARRAY_BUFFER, this.vertexArray, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.position); gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.uv); gl.vertexAttribPointer(this.uv, 2, gl.FLOAT, false, 16, 8);
    gl.uniform2f(this.sizeLocation, width, height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (source !== this.lastSource || textureVersion === undefined || textureVersion !== this.lastVersion || source.width !== this.textureWidth || source.height !== this.textureHeight) {
      if (source.width === this.textureWidth && source.height === this.textureHeight) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); this.textureWidth = source.width; this.textureHeight = source.height; }
      this.lastSource = source; this.lastVersion = textureVersion;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer); gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
    return this.canvas;
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    const gl = this.gl;
    if (gl) { gl.deleteBuffer(this.vertexBuffer); gl.deleteBuffer(this.indexBuffer); gl.deleteTexture(this.texture); gl.deleteProgram(this.program); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    this.gl = null; this.lastSource = null; this.canvas.width = this.canvas.height = 0;
  }
}
