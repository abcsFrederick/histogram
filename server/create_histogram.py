#!/usr/bin/env python

###############################################################################
#  Girder plugin framework and tests adapted from Kitware Inc. source and
#  documentation by the Imaging and Visualization Group, Advanced Biomedical
#  Computational Science, Frederick National Laboratory for Cancer Research.
#
#  Copyright Kitware Inc.
#
#  Licensed under the Apache License, Version 2.0 ( the "License" );
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
###############################################################################

import json
import numpy

in_path = in_path   # noqa
label = label   # noqa
bins = bins   # noqa
bitmask = bitmask   # noqa

try:
    import PIL.Image
    PIL.Image.MAX_IMAGE_PIXELS = 10000000000
    image = PIL.Image.open(in_path)
except (ImportError, IOError, OSError):
    import pytiff
    image = pytiff.Tiff(in_path)
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

if bitmask:
    hist = numpy.zeros(array.dtype.itemsize*8 + 1 - label)
    if not label:
        hist[0] = (array == 0).sum()
    binEdges = numpy.arange(label, hist.shape[0] + label)
    for i in range(1, hist.shape[0] + label):
        hist[i - label] = (array & 1 << i - 1 > 0).sum()
else:
    hist, binEdges = numpy.histogram(array, bins=bins)

histogram = json.dumps({
    'label': label,
    'bitmask': bitmask,
    'bins': bins,
    'hist': list(hist),
    'binEdges': list(binEdges),
})

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
