import './routes';

import { registerPluginNamespace } from 'girder/pluginUtils';

import * as histogram from './index';

registerPluginNamespace('histogram', histogram);
