import _ from 'underscore';
import View from 'girder/views/View';

import rangeSliderWidget from '../../templates/widgets/rangeSliderWidget.pug';
import '../../stylesheets/widgets/rangeSliderWidget.styl';

var RangeSliderWidget = View.extend({

    events: {
        'mousedown .range-slider': 'onSliderBegin'
    },
    initialize: function (settings) {
        this.binEdges = settings.binEdges;
        this.hist = settings.hist;
        this.range = settings.range;
        return View.prototype.initialize.apply(this, arguments);
    },

    // TODO: maping pixels to hist, bins/increments

    // FIXME: events prototype
    onSliderEnd: function (e) {
        if (!this._mousedown) return;
        this._mousedown = false;
        var sliderRange = this.sliderRange;
        var range = this.bins;
        var _range = {
            min: range.min,
            max: range.max
        };

        let offset;
        if (this._minSider) {
            let n = Math.round((this.$('.min-range-slider').offset().left - sliderRange.min) / this.barWidth);
            offset = Math.round(n * this.barWidth) + sliderRange.min;
            this.$('.min-range-slider').offset({left: offset});
            _range.min = n;
        } else if (this._maxSider) {
            let n = Math.round((sliderRange.max - this.$('.max-range-slider').offset().left) / this.barWidth);
            offset = sliderRange.max - Math.round(n * this.barWidth);
            this.$('.max-range-slider').offset({left: offset});
            _range.max = this.hist.length - n - 1;
        }

        if (_range.min !== range.min || _range.max !== range.max) {
            range.min = _range.min;
            range.max = _range.max;
            // let maxIndex = range.max;
            if (this.hist.length === this.binEdges.length) {
                // maxIndex++;
            }
            this.trigger('h:range', {
                range: {
                    min: this.binEdges[range.min],
                    max: this.binEdges[range.max]
                },
                bins: {
                    min: range.min,
                    max: range.max
                }
            });
        }
    },

    onSliderMove: function (e) {
        if (this._mousedown) {
            let offset = e.pageX;
            offset = Math.max(offset, this.sliderRange_.min);
            offset = Math.min(offset, this.sliderRange_.max);
            this.curSlider.offset({left: offset});
        }
    },

    onSliderBegin: function (e) {
        this.curSlider = $(e.currentTarget);

        var prevSibling = this.curSlider.prev('.range-slider');
        var nextSibling = this.curSlider.next('.range-slider');

        this._maxSider = prevSibling.length ? 1 : 0;
        this._minSider = !this._maxSider;

        var parentOffset = this.curSlider.parent().offset().left;
        var parentWidth = this.curSlider.parent().width();
        var sliderWidth = this.curSlider.parent().height();
        this.sliderRange_ = {
            min: prevSibling.length ? prevSibling.offset().left + sliderWidth + Math.floor(this.barWidth) : parentOffset - sliderWidth,
            max: nextSibling.length ? nextSibling.offset().left - sliderWidth - Math.floor(this.barWidth) : parentOffset + parentWidth
        };
        this._mousedown = true;
    },

    render: function () {
        this.$el.html(rangeSliderWidget());

        var parentOffset = this.$el.offset().left;
        var parentWidth = this.$el.width();
        var sliderWidth = this.$el.height();
        this.barWidth = parentWidth / this.binEdges.length;

        this.sliderRange = {
            min: parentOffset - sliderWidth,
            max: parentOffset + parentWidth
        };

        this.bins = {min: 0, max: this.hist.length - 1};

        if (this.range) {
            this.binEdges.forEach((value, index) => {
                if (value === this.range.min) {
                    this.bins.min = index;
                }
                if (value === this.range.max) {
                    this.bins.max = index;
                }
            });
        }

        var sliderOffset = {min: this.sliderRange.min, max: this.sliderRange.max};
        sliderOffset.min += this.bins.min * this.barWidth;
        sliderOffset.max -= (this.hist.length - this.bins.max - 1) * this.barWidth;
        this.$('.min-range-slider').offset({left: sliderOffset.min});
        this.$('.max-range-slider').offset({left: sliderOffset.max});

        $('body').on('mousemove', _.bind(this.onSliderMove, this));
        $('body').on('mouseup', _.bind(this.onSliderEnd, this));
        return this;
    }
});

export default RangeSliderWidget;
