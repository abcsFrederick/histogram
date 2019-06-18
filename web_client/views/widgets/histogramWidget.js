import _ from 'underscore';

import eventStream from 'girder/utilities/EventStream';
import View from 'girder/views/View';
import events from 'girder/events';
import { restRequest } from 'girder/rest';

import histogramWidget from '../../templates/widgets/histogramWidget.pug';
import '../../stylesheets/widgets/histogramWidget.styl';
import RangeSliderWidget from './rangeSliderWidget';

var HistogramWidget = View.extend({
    events: {
        'click .g-histogram-bar': '_onHistogramBar'
    },

    initialize: function (settings) {
        this.status = null;
        this.excludedBins = [];

        this.colormap = settings.colormap;

        this.threshold = settings.threshold;

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
        if (this._rangeSliderView) {
            this.stopListening(this._rangeSliderView);
            this._rangeSliderView.off();
            this.$('#g-histogram-slider-container').empty();
        }
        if (this.histogram) {
            this._histogramSliderRender(hist, binEdges);
        }
        this.$('[data-toggle="tooltip"]').tooltip({container: 'body'});

        return this;
    },

    _histogramSliderRender: function (hist, binEdges) {
        this._rangeSliderView = new RangeSliderWidget({
            el: this.$('#g-histogram-slider-container'),
            parentView: this,
            binEdges: binEdges,
            hist: hist,
            range: this.threshold
        }).render();

        this.$('.g-histogram-bar').each((i, bar) => {
            if ($(bar).attr('i') >= this._rangeSliderView.bins.min &&
                $(bar).attr('i') <= this._rangeSliderView.bins.max) {
                $(bar).addClass('selected');
            }
            if (_.contains(this.excludedBins, i + this.model.get('label'))) {
                $(bar).addClass('exclude');
            }
        });
        this.listenTo(this._rangeSliderView, 'h:range', function (evt) {
            this.threshold = evt.range;
            this.bin_range = evt.bins;
            this.$('.g-histogram-bar').each((i, bar) => {
                if ($(bar).attr('i') >= evt.bins.min && $(bar).attr('i') <= evt.bins.max) {
                    $(bar).addClass('selected');
                } else {
                    $(bar).removeClass('selected');
                    $(bar).removeClass('exclude');
                }
            });
            // this.renderColormap();
            this.trigger('h:range', evt);
        });
    },
    setColormap: function (colormap) {
        this.colormap = colormap;

        this.render();
    },
    renderColormap: function () {
        if (!this.model || !this.colormap || !this.colormap.get('colormap') || !this.model.get('bitmask') && !this.bin_range) {
            this.$('.g-histogram-bar').each((i, bar) => {
                $(bar).css('fill', '');
            });
            return;
        }
        if (!this.model.get('bitmask')) {
            var scale = this.model.get('bins') / (this.bin_range.max - this.bin_range.min);
        }
        var colormapArray = this.colormap.get('colormap');
        this.$('.g-histogram-bar').each((i, bar) => {
            if (i < this.bin_range.min || i > this.bin_range.max) {
                $(bar).css('fill', '');
                return;
            }
            if (this.model.get('bitmask')) {
                // i -= !this.model.get('label');
                // i = i >= 0 ? 1 << i : 0;
                i += this.model.get('label') ? 1 : 0;
                i = Math.round(i * 255 / 8);
            } else {
                i = Math.round(scale * (i - this.bin_range.min));
            }
            if (!colormapArray[i]) {
                return;
            }
            $(bar).css('fill', 'rgb(' + colormapArray[i].join(', ') + ')');
        });
    }
});

export default HistogramWidget;
