import unittest

import histogramScript.create_histogram


class CreateHistogramTest(unittest.TestCase):
    def setUp(self):
        self.path = 'plugins/histogram/plugin_tests/test_files/Seg.tiff'
        self.label = False
        self.bins = 256
        self.bitmask = False

    def testComputeHistogram(self):

        hist, binEdges = histogramScript.create_histogram.computeHistogram(self.path,
                                                                           self.label,
                                                                           self.bins,
                                                                           self.bitmask)
        self.assertEqual(binEdges[-1], 256)
        self.assertEqual(len(binEdges), 257)
        self.assertEqual(hist[-1], 5647232)
