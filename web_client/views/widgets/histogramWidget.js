import _ from 'underscore';

import eventStream from 'girder/utilities/EventStream';
import View from 'girder/views/View';
import events from 'girder/events';
import { restRequest } from 'girder/rest';

import histogramWidget from '../../templates/widgets/histogramWidget.pug';
import '../../stylesheets/widgets/histogramWidget.styl';

var HistogramWidget = View.extend({
    events: {
        'click .g-histogram-bar': '_onHistogramBar'
    },

    initialize: function (settings) {
        this.status = null;
        this.excludedBins = [];

        this.colormap = settings.colormap;

        this.listenTo(this.model, 'change:fileId', this._getHistogramFile);
        // TODO: filter on event data
        this.listenTo(
            eventStream,
            'g:event.histogram.finished_histogram',
            this._onFinishedHistogram
        );
        this.listenTo(
            events,
            'g:login g:eventStream.start',
            this._getHistogram
        );

        this._getHistogram();

        View.prototype.initialize.apply(this, arguments);
    },

    _error: function (err) {
        if (err) {
            console.log(err);
        }
        this.histogram = undefined;
        this.status = 'error';
        this.render();
    },

    _onError: function (err) {
        this.model.off('g:error', this._onError, this);
        this._error(err);
    },

    _onFinishedHistogram: function () {
        this.model.fetch({ignoreError: true}).done(() => {
            if (!this.model.hasChanged('fileId')) {
                this.status = null;
                this.render();
            }
        }).fail(this._error);
    },

    /**
     * Get the histogram file, load JSON contents, and render
     */
    _getHistogramFile: function (model, fileId) {
        if (fileId) {
            return restRequest({
                url: `file/${fileId}/download`,
                method: 'GET',
                error: null
            }).done((resp) => {
                this.histogram = resp;
                this.status = null;
                this.render();
            }).fail(this._error);
        } else {
            this.histogram = undefined;
            this.status = null;
            this.render();
        }
    },

    /**
     * Fetch the histogram model, and if not found save the model to create a
     * histogram job. fileId will be updated with the histogram file containing
     * the histogram data.
     */
    _getHistogram: function () {
        this.status = 'loading';
        this.render();
        if (!this.model.get('_id')) {
            this.status = null;
            this.render();
            return;
        }
        this.model.fetch({ignoreError: true}).done(() => {
            if (!this.model.hasChanged('fileId')) {
                this.status = null;
                this.render();
            }
        }).fail((error) => {
            console.log(error);
        });
    },

    _onHistogramBar: function (evt) {
        if (!this.model.get('bitmask')) {
            return;
        }

        var bin = parseInt($(evt.target).attr('i'));

        if (_.contains(this.excludedBins, bin)) {
            this.excludedBins = _.without(this.excludedBins, bin);
        } else {
            this.excludedBins.push(bin);
        }

        this.trigger('h:excludeBins', { value: this.excludedBins.slice() });

        this.render();
    },

    render: function () {
        var height = this.$el.height() || 0;

        var hist = [], binEdges;
        if (this.histogram) {
            hist = this.histogram.hist;
            binEdges = this.histogram.binEdges;
        }

        this.$('[data-toggle="tooltip"]').tooltip('destroy');

        this.$el.html(histogramWidget({
            id: 'g-histogram-container',
            status_: this.status,
            hist: hist,
            binEdges: binEdges,
            height: height,
            excludedBins: this.excludedBins,
            colormap: this.colormap,
            label: this.model.get('label')
        }));

        this.$('[data-toggle="tooltip"]').tooltip({container: 'body'});

        return this;
    },

    setColormap: function (colormap) {
        this.colormap = colormap;

        this.render();
    }
});

export default HistogramWidget;
