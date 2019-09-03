girderTest.importPlugin('jobs');
girderTest.importPlugin('worker');
girderTest.importPlugin('large_image');
girderTest.importPlugin('histogram');
girderTest.startApp();

function _goToHistogramPluginSettings() {
    waitsFor(function () {
        return $('a[g-target="admin"]:visible').length > 0;
    }, 'admin console link to display');

    runs(function () {
        $('a[g-target="admin"]:visible').click();
    });

    waitsFor(function () {
        return $('.g-plugins-config:visible').length > 0;
    }, 'admin console to display');

    runs(function () {
        $('.g-plugins-config:visible').click();
    });

    waitsFor(function () {
        return $('a[g-route="plugins/histogram/config"]:visible').length > 0;
    }, 'plugins page to display');

    runs(function () {
        $('a[g-route="plugins/histogram/config"]:visible').click();
    });

    waitsFor(function () {
        return $('#g-histogram-settings-form:visible').length > 0;
    }, 'histogram config to display');

    waitsFor(function () {
        return girder.rest.numberOutstandingRestRequests() === 0;
    }, 'rest requests to finish');
}

$(function () {
    var itemId, histogramId;

    describe('Test the histogram plugin', function () {
        it('create the admin user', function () {
            // girderTest.createUser(
            //     'admin', 'admin@email.com', 'Admin', 'Admin', 'testpassword')();
            waitsFor(function () {
                return $('.g-register').length > 0;
            }, 'Girder app to render');

            runs(function () {
                $('.g-register').click();
            });

            waitsFor(function () {
                console.log('-------------modal-------------');
                console.log($('.modal'));
                console.log('-------------modal bs.modal-------------');
                console.log($('.modal').data('bs.modal'));
                console.log('-------------modal bs.modal isShown-------------');
                console.log($('.modal').data('bs.modal').isShown);
                console.log('-------------length-------------');
                console.log($('#g-dialog-container:visible').length);
                return $('.modal').data('bs.modal') &&
                    $('.modal').data('bs.modal').isShown === true &&
                    $('#g-dialog-container:visible').length > 0;
            }, 'a dialog to fully render');
        });

        it('goes to histogram plugin settings', _goToHistogramPluginSettings);

        it('sets and saves histogram bins', function () {
            var settings;
            runs(function () {
                $('#g-histogram-settings-default-bins').val(256);
                $('#g-histogram-settings-form').submit();
            });
            waitsFor(function () {
                return $('.alert:contains("Settings saved.")').length > 0;
            }, 'settings to save');

            runs(function () {
                girder.rest.restRequest({
                    url: 'histogram/settings'
                }).then(function (resp) {
                    settings = resp;
                    return null;
                });
            });

            waitsFor(function () {
                return settings !== undefined;
            }, 'get histogram settings');

            runs(function () {
                expect(settings['histogram.default_bins']).toBe(256);
            });
        });
        it('go to collections page', function () {
            runs(function () {
                $("a.g-nav-link[g-target='collections']").click();
            });

            waitsFor(function () {
                return $('.g-collection-create-button:visible').length > 0;
            }, 'navigate to collections page');

            runs(function () {
                expect($('.g-collection-list-entry').length).toBe(0);
            });
        });
        it('create collection', girderTest.createCollection('test', '', 'image'));

        it('upload test file', function () {
            girderTest.waitForLoad();
            runs(function () {
                $('.g-folder-list-link:first').click();
            });
            girderTest.waitForLoad();
            runs(function () {
                girderTest.binaryUpload('plugins/large_image/plugin_tests/test_files/small_la.tiff');
            });
            girderTest.waitForLoad();
            runs(function () {
                itemId = $('.large_image_thumbnail img').prop('src').match(/\/item\/([^/]*)/)[1];
            });
        });
        describe('not bitmask histogram test', function () {
            it('create test histogram', function () {
                var job;
                runs(function () {
                    girder.rest.restRequest({
                        url: 'histogram',
                        type: 'POST',
                        data: { itemId: itemId }
                    }).then(function (resp) {
                        job = new girder.plugins.jobs.models.JobModel({
                            _id: resp._id
                        });
                        return null;
                    });
                });
                waitsFor(function () {
                    return job !== undefined;
                });
                waitsFor(function () {
                    var fetched = false;
                    job.fetch().then(function (resp) {
                        fetched = true;
                        return null;
                    });
                    waitsFor(function () {
                        return fetched;
                    });
                    return job.get('status') !== undefined && girder.plugins.jobs.JobStatus.finished(job.get('status'));
                });
                runs(function () {
                    expect(job.get('status')).toBe(girder.plugins.jobs.JobStatus.SUCCESS);
                    girder.rest.restRequest({
                        url: 'histogram',
                        type: 'GET',
                        data: {
                            jobId: job.get('_id'),
                            limit: 2
                        }
                    }).then(function (resp) {
                        expect(resp.length).toBe(1);
                        histogramId = resp[0]._id;
                        return null;
                    });
                });
                waitsFor(function () {
                    return histogramId !== undefined;
                });
            });
            it('view test histogram', function () {
                runs(function () {
                    girder.router.navigate('histogram/' + histogramId + '/view', {trigger: true});
                });
            });
            girderTest.waitForLoad();
            it('check histogram bins', function () {
                expect($('.g-histogram-bar').length).toBe(256);
            });
            it('check histogram bin height', function () {
                expect($('#g-histogram-bar-0').attr('style')).toMatch(/ 0%\)$/);
                expect($('#g-histogram-bar-128').attr('style')).toMatch(/ 100%\)$/);
                expect($('#g-histogram-bar-255').attr('style')).toMatch(/ 0%\)$/);
            });
            it('check histogram bin label', function () {
                expect($('#g-histogram-bar-0').attr('data-original-title')).toMatch(/bin: 1 n: 2/);
                expect($('#g-histogram-bar-127').attr('data-original-title')).toMatch(/bin: 128 n: 0/);
                expect($('#g-histogram-bar-255').attr('data-original-title')).toMatch(/bin: 256 n: 2/);
            });
            describe('histogram check slider and click on bar', function () {
                var initLeft, initTop, initLeftMax, initTopMax, mousemoveEvent, mousemoveEventMax;

                beforeEach(function () {
                    initLeft = $('.range-slider.min-range-slider').offset().left;
                    initTop = $('.range-slider.min-range-slider').offset().top;
                    initLeftMax = $('.range-slider.max-range-slider').offset().left;
                    initTopMax = $('.range-slider.max-range-slider').offset().top;
                    mousemoveEvent = $.Event('mousemove');
                    mousemoveEvent.pageX = initLeft + 10;
                    mousemoveEvent.pageY = initTop + 10;
                    mousemoveEventMax = $.Event('mousemove');
                    mousemoveEventMax.pageX = initLeftMax - 10;
                    mousemoveEventMax.pageY = initTopMax - 10;
                });
                it('slider render', function () {
                    expect($('.range-slider.min-range-slider').length).toBe(1);
                    expect($('.range-slider.max-range-slider').length).toBe(1);
                });

                it('click on bar', function () {
                    runs(function () {
                        $('#g-histogram-bar-0').click();
                        expect($('#g-histogram-bar-0').hasClass('selected')).toBe(true);
                    });
                });

                it('min slider move right 10 px', function () {
                    runs(function () {
                        $('.min-range-slider').mousedown();
                        $('body').trigger(mousemoveEvent);
                        $('body').mouseup();
                    });
                    waitsFor(function () {
                        return $('.min-range-slider').offset().left > initLeft;
                    }, 'slider moves done');
                    runs(function () {
                        expect($('.min-range-slider').offset().left).toBe(initLeft + 10);
                        expect($('.min-range-slider').offset().top).toBe(initTop);
                    });
                    waitsFor(function () {
                        return !$('#g-histogram-bar-0').hasClass('selected');
                    }, 'color map(#g-histogram-bar-0) bar hide');
                });

                it('max slider move left 10 px', function () {
                    runs(function () {
                        $('.max-range-slider').mousedown();
                        $('body').trigger(mousemoveEventMax);
                        $('body').mouseup();
                    });
                    waitsFor(function () {
                        return $('.max-range-slider').offset().left < initLeftMax;
                    }, 'slider moves done');
                    runs(function () {
                        expect($('.max-range-slider').offset().left).toBe(initLeftMax - 10);
                        expect($('.max-range-slider').offset().top).toBe(initTopMax);
                    });
                    waitsFor(function () {
                        return !$('#g-histogram-bar-255').hasClass('selected');
                    }, 'color map(#g-histogram-bar-0) bar hide');
                });
            });
        });
        describe('bitmask histogram test', function () {
            it('create test bitmask histogram', function () {
                var job, bitHistogramId;
                runs(function () {
                    girder.rest.restRequest({
                        url: 'histogram',
                        type: 'POST',
                        data: { itemId: itemId, bitmask: true }
                    }).then(function (resp) {
                        job = new girder.plugins.jobs.models.JobModel({
                            _id: resp._id
                        });
                        return null;
                    });
                });
                waitsFor(function () {
                    return job !== undefined;
                });
                waitsFor(function () {
                    var fetched = false;
                    job.fetch().then(function (resp) {
                        fetched = true;
                        return null;
                    });
                    waitsFor(function () {
                        return fetched;
                    });
                    return job.get('status') !== undefined && girder.plugins.jobs.JobStatus.finished(job.get('status'));
                });
                runs(function () {
                    expect(job.get('status')).toBe(girder.plugins.jobs.JobStatus.SUCCESS);
                    girder.rest.restRequest({
                        url: 'histogram',
                        type: 'GET',
                        data: {
                            jobId: job.get('_id'),
                            limit: 2
                        }
                    }).then(function (resp) {
                        expect(resp.length).toBe(1);
                        bitHistogramId = resp[0]._id;
                        return null;
                    });
                });
                waitsFor(function () {
                    return bitHistogramId !== undefined;
                });
            });
            it('view test bitmask histogram', function () {
                runs(function () {
                    girder.router.navigate('histogram/' + histogramId + '/view', {trigger: true});
                });
            });
            girderTest.waitForLoad();
            describe('bitmask histogram check slider and click on bar', function () {
                var initLeft, initRight, range, initTop, mousemoveEvent;

                beforeEach(function () {
                    initLeft = $('.range-slider.min-range-slider').offset().left;
                    initRight = $('.range-slider.max-range-slider').offset().left;
                    range = initRight - initLeft;
                    initTop = $('.range-slider.min-range-slider').offset().top;
                    mousemoveEvent = $.Event('mousemove');
                    mousemoveEvent.pageX = initLeft + range / 8;
                    mousemoveEvent.pageY = initTop + range / 8;
                });
                it('slider render', function () {
                    expect($('.range-slider.min-range-slider').length).toBe(1);
                    expect($('.range-slider.max-range-slider').length).toBe(1);
                });

                it('min slider move right 1/8 of bin range px', function () {
                    runs(function () {
                        $('.min-range-slider').mousedown();
                        $('body').trigger(mousemoveEvent);
                        $('body').mouseup();
                    });
                    waitsFor(function () {
                        return $('.min-range-slider').offset().left > initLeft;
                    }, 'slider moves done');
                    runs(function () {
                        expect($('#g-histogram-bar-0').hasClass('exclude')).toBe(true);
                        expect($('.min-range-slider').offset().top).toBe(initTop);
                    });
                    waitsFor(function () {
                        return !$('#g-histogram-bar-0').hasClass('selected');
                    }, 'color map(#g-histogram-bar-0) bar hide');
                });

                it('click on bar', function () {
                    runs(function () {
                        $('#g-histogram-bar-3').click();
                    });
                    waitsFor(function () {
                        return !$('#g-histogram-bar-3').hasClass('selected');
                    }, 'color map(#g-histogram-bar-3) bar hide');
                    runs(function () {
                        $('#g-histogram-bar-0').click();
                    });
                    waitsFor(function () {
                        return $('#g-histogram-bar-0').hasClass('exclude');
                    }, 'color map(#g-histogram-bar-0) bar should still hide');
                    runs(function () {
                        expect($('#g-histogram-bar-0').hasClass('selected')).toBe(false);
                    });
                });
            });
        });

        it('test histogram settings', function () {
            var done;
            girder.rest.restRequest({
                url: 'histogram/settings',
                type: 'GET'
            }).then(function (resp) {
                done = true;
                return null;
            });
            waitsFor(function () {
                return done !== undefined;
            });
        });
    });
});
