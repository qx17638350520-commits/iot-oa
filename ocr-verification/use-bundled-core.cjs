/* Test the exact self-hosted browser core files in a genuine Node WASM worker. */
const path=require('path');
for(const stem of ['tesseract-core-lstm','tesseract-core-simd-lstm']){
 const original=require.resolve('tesseract.js-core/'+stem);
 const bundled=require(path.resolve(__dirname,'../static/ocr/vendor/core/'+stem+'.wasm.js'));
 require.cache[original]={id:original,filename:original,loaded:true,exports:bundled};
}
