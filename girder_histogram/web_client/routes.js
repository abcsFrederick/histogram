/* eslint-disable import/first */
import _ from 'underscore';

import events from '@girder/core/events';
import router from '@girder/core/router';
import { exposePluginConfig } from '@girder/core/utilities/PluginUtils';

exposePluginConfig('histogram', 'plugins/histogram/config');

import ConfigView from './views/views/configView';
router.route('plugins/histogram/config', 'histogramConfig', function () {
    events.trigger('g:navigateTo', ConfigView);
});

import HistogramModel from './models/HistogramModel';
import HistogramWidget from './views/widgets/histogramWidget';
router.route('histogram/:id/view', 'histogramView', function (histogramId, params) {
    var histogram = new HistogramModel({_id: histogramId});
    events.trigger('g:navigateTo', HistogramWidget, _.extend({
        model: histogram
    }, params || {}));
});
