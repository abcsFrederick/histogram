import eventStream from 'girder/utilities/EventStream';
import View from 'girder/views/View';
import events from 'girder/events';
import { restRequest } from 'girder/rest';

import histogramWidget from '../../templates/widgets/histogramWidget.pug';
import '../../stylesheets/widgets/histogramWidget.styl';

var HistogramWidget = View.extend({
    initialize: function (settings) {
        this.status = null;

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
        this.model.fetch({ignoreError: true}).done(() => {
            if (!this.model.hasChanged('fileId')) {
                this.status = null;
                this.render();
            }
        }).fail((reason) => {
            if (reason.status === 404) {
                this.model.off('g:error', this._onError, this).on('g:error', this._onError, this).save();
            } else {
                this._error(reason);
            }
        });
    },

    render: function () {
        var height = this.$el.height() || 0;

        var hist = [], binEdges;
        if (this.histogram) {
            hist = this.histogram.hist;
            binEdges = this.histogram.binEdges;
        }

        this.$el.html(histogramWidget({
            id: 'h-histogram-container',
            status_: this.status,
            hist: hist,
            binEdges: binEdges,
            height: height
        }));

        this.$('[data-toggle="tooltip"]').tooltip({container: 'body'});

        return this;
    }
});

export default HistogramWidget;
