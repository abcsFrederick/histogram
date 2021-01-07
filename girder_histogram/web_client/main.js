import './routes';

import { registerPluginNamespace } from '@girder/core/pluginUtils';

import * as histogram from './index';

registerPluginNamespace('histogram', histogram);
