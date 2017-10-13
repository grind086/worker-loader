/* eslint-disable
  import/first,
  import/order,
  comma-dangle,
  linebreak-style,
  no-param-reassign,
  no-underscore-dangle
*/
import schema from './options.json';
import loaderUtils from 'loader-utils';
import validateOptions from 'schema-utils';

import NodeTargetPlugin from 'webpack/lib/node/NodeTargetPlugin';
import SingleEntryPlugin from 'webpack/lib/SingleEntryPlugin';
import WebWorkerTemplatePlugin from 'webpack/lib/webworker/WebWorkerTemplatePlugin';

import getWorker from './get';

export default function loader() {}

export function pitch(request) {
  if (!this.webpack) throw new Error('Only usable with webpack');

  this.cacheable(false);

  const cb = this.async();
  const options = loaderUtils.getOptions(this) || {};

  validateOptions(schema, options, 'Worker Loader');

  const worker = {};

  const filename = loaderUtils.interpolateName(this, options.name || '[hash].worker.js', {
    context: options.context || this.options.context,
    regExp: options.regExp,
  });

  worker.options = {
    filename,
    chunkFilename: `[id].${filename}`,
    namedChunkFilename: null,
  };

  // TODO remove and triage eventual replacement via an option if needed
  // doesn't work with webpack > v2.0.0
  if (this.options && this.options.worker && this.options.worker.output) {
    Object.keys(this.options.worker.output).forEach((name) => {
      worker.options[name] = this.options.worker.output[name];
    });
  }

  worker.compiler = this._compilation
    .createChildCompiler('worker', worker.options);

  worker.compiler.apply(new WebWorkerTemplatePlugin(worker.options));

  if (this.target !== 'webworker' && this.target !== 'web') {
    worker.compiler.apply(new NodeTargetPlugin());
  }

  worker.compiler.apply(new SingleEntryPlugin(this.context, `!!${request}`, 'main'));

  // TODO remove and triage eventual replacement via an option if needed
  // doesn't work with webpack > v2.0.0
  if (this.options && this.options.worker && this.options.worker.plugins) {
    this.options.worker.plugins.forEach(plugin => worker.compiler.apply(plugin));
  }

  const subCache = `subcache ${__dirname} ${request}`;

  worker.compiler.plugin('compilation', (compilation) => {
    if (compilation.cache) {
      if (!compilation.cache[subCache]) compilation.cache[subCache] = {};

      compilation.cache = compilation.cache[subCache];
    }
  });

  worker.compiler.runAsChild((err, entries, compilation) => {
    if (err) return cb(err);

    if (entries[0]) {
      worker.file = entries[0].files;

      worker.factory = getWorker(
        worker.file,
        compilation.assets[worker.file].source(),
        options
      );

      if (options.fallback === false) {
        delete this._compilation.assets[worker.file];
      }

      return cb(null, `module.exports = function() {\n  return ${worker.factory};\n};`);
    }

    return cb(null, null);
  });
}
