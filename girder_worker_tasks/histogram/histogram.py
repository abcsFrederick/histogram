#!/usr/bin/env python

from girder_worker.app import app
from girder_worker.utils import girder_job

@app.task(bind=True)
def histogram(self, in_path, label, bins, bitmask, **kwargs):

    outputPath = start_processing(in_path, label, bins, bitmask)
    print(outputPath)
    return outputPath


import json
import numpy
from tempfile import NamedTemporaryFile


def computeHistogram(in_path, label, bins, bitmask):
    try:
        import PIL.Image
        PIL.Image.MAX_IMAGE_PIXELS = 10000000000
        image = PIL.Image.open(in_path)
        print('use pil')
    except (ImportError, IOError, OSError):
        import pytiff
        image = pytiff.Tiff(in_path)
        print('use pytiff')
    else:
        if image.mode not in ('1', 'L', 'P', 'I', 'F'):
            raise ValueError('invalid image type for histogram: %s' % image.mode)
    array = numpy.array(image)
    if label:
        array = array[numpy.nonzero(array)]

    # TODO: integer histogram optimizations
    '''
    if array.dtype == numpy.uint8 and bins == 256:
        _bins = range(bins + 1)
    else:
        _bins = bins
    '''
    if array.dtype == numpy.uint8:
        _bins = numpy.arange(numpy.min(array), numpy.max(array) + 2)

    if bitmask:
        hist = numpy.zeros(array.dtype.itemsize*8 + 1 - label)
        if not label:
            hist[0] = (array == 0).sum()
        binEdges = numpy.arange(label, hist.shape[0] + label)
        for i in range(1, hist.shape[0] + label):
            hist[i - label] = (array & 1 << i - 1 > 0).sum()
    else:
        hist, binEdges = numpy.histogram(array, bins=_bins)

    return hist, binEdges


def start_processing(in_path, label, bins, bitmask):
    # Define Girder Worker globals for the style checker
    in_path = in_path   # noqa
    label = label   # noqa
    bins = bins   # noqa
    bitmask = bitmask   # noqa

    hist, binEdges = computeHistogram(in_path, label, bins, bitmask)

    histogram = NamedTemporaryFile(delete=False).name+'.json'

    with open(histogram, 'w') as outfile:
        json.dump({
            'label': label,
            'bitmask': bitmask,
            'bins': bins,
            'hist': hist.tolist(),
            'binEdges': binEdges.tolist()
        }, outfile)
    return histogram

# TODO: implement RGB(A)
'''
result = {}
for i, channel in enumerate(('red', 'green', 'blue')):
    hist, binEdges = numpy.histogram(array[:, :, i], **histogram_kwargs)
    result[channel] = {
       'values': list(hist),
        'bins': list(binEdges),
    }
'''
