import _ from 'underscore';

import eventStream from '@girder/core/utilities/EventStream';
import View from '@girder/core/views/View';
import events from '@girder/core/events';
import { restRequest } from '@girder/core/rest';

import histogramWidget from '../../templates/widgets/histogramWidget.pug';
import '../../stylesheets/widgets/histogramWidget.styl';
import RangeSliderWidget from './rangeSliderWidget';

var HistogramWidget = View.extend({
    events: {
        'click .g-histogram-bar': '_onHistogramBar'
    },

    initialize: function (settings) {
        this.status = 'loading';
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
                // dev server resp as string for some reason
                if (typeof(resp) === 'string') {
                    resp = JSON.parse(resp);
                }
                this.histogram = resp;
                this.status = null;
                this.render();
            }).fail(this._error);
        } else {
            this.histogram = undefined;
            this.status = 'loading';
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
            this.status = 'loading';
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
        if ($(evt.target).attr('i') < this.threshold.min - 1 ||
            $(evt.target).attr('i') > this.threshold.max - 1) {
            return;
        }
        var bin = parseInt($(evt.target).attr('i'));

        let _min = this.threshold.min - 1,
            _max = this.threshold.max - 1,
            excludeInSliderRange = [], exclude;
        for (let i = 0; i < _min; i++) {
            excludeInSliderRange.push(i);
        }
        for (let i = 7; i > _max; i--) {
            excludeInSliderRange.push(i);
        }

        if (_.contains(this.excludedBins, bin)) {
            this.excludedBins = _.without(this.excludedBins, bin);
        } else {
            this.excludedBins.push(bin);
        }
        if (this.excludedBins.length) {
            exclude = excludeInSliderRange.concat(this.excludedBins);
        } else {
            exclude = excludeInSliderRange;
        }

        this.trigger('h:excludeBins', { value: _.uniq(exclude) });

        this.render();
    },

    render: function () {
        var height = this.$el.height() || 0;
        // debugger
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
        if (this._rangeSliderView) {
            this._rangeSliderView.destroy();
            $('body').off('mousemove');
            $('body').off('mouseup');
        }
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
            } else {
                $(bar).addClass('exclude');
            }
            if (_.contains(this.excludedBins, i)) {
                // debugger
                $(bar).removeClass('selected');
                $(bar).addClass('exclude');
            }
        });
        this.listenTo(this._rangeSliderView, 'h:range', function (evt) {
            this.threshold = evt.range;
            this.bin_range = evt.bins;
            this.$('.g-histogram-bar').each((i, bar) => {
                if ($(bar).attr('i') >= evt.bins.min && $(bar).attr('i') <= evt.bins.max && !(_.contains(this.excludedBins, i))) {
                    $(bar).removeClass('exclude');
                    $(bar).addClass('selected');
                } else {
                    $(bar).removeClass('selected');
                    $(bar).addClass('exclude');
                }
            });
            this.trigger('h:range', evt);
        });
    },
    setColormap: function (colormap) {
        this.colormap = colormap;

        this.render();
    }
});

export default HistogramWidget;
