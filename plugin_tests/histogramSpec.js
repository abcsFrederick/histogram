girderTest.importPlugin('jobs');
girderTest.importPlugin('worker');
girderTest.importPlugin('large_image');
girderTest.importPlugin('histogram');
girderTest.startApp();

$(function () {
    var itemId, histogramId;

    describe('Test the histogram plugin', function () {
        it('create the admin user', function () {
            girderTest.createUser(
                'admin', 'admin@email.com', 'Admin', 'Admin', 'testpassword')();
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
            expect($('.g-histogram-plot-bar').length).toBe(256);
        });
        it('check histogram bin height', function () {
            expect($('#g-histogram-plot-bar-0').attr('style')).toBe('height: 100%');
            expect($('#g-histogram-plot-bar-128').attr('style')).toBe('height: 0%');
            expect($('#g-histogram-plot-bar-255').attr('style')).toBe('height: 100%');
        });
        it('check histogram bin label', function () {
            expect($('#g-histogram-plot-bar-0').attr('data-original-title')).toMatch(/bin: 1 n: 2/);
            expect($('#g-histogram-plot-bar-127').attr('data-original-title')).toMatch(/bin: 128 n: 0/);
            expect($('#g-histogram-plot-bar-255').attr('data-original-title')).toMatch(/bin: 256 n: 2/);
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
