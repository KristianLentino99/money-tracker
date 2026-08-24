<template>
  <div ref="chartContainerRef" class="relative h-55 w-full">
    <svg ref="svgRef" class="h-full w-full"></svg>

    <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div class="flex flex-col items-center gap-0.5 text-center">
        <template v-if="centerLabel.isHovering">
          <div class="text-muted-foreground text-xs">{{ centerLabel.name }}</div>
          <div class="text-base font-semibold">{{ centerLabel.amount }}</div>
          <div class="text-muted-foreground text-xs">{{ centerLabel.percentage }}</div>
        </template>
        <template v-else>
          <div class="text-muted-foreground text-xs">{{ $t('common.labels.total') }}</div>
          <div class="text-base font-semibold">{{ formatBaseCurrency(totalAmount) }}</div>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useFormatCurrency } from '@/composable';
import * as d3 from 'd3';
import { useResizeObserver } from '@vueuse/core';
import { nextTick, reactive, ref, watch } from 'vue';

import { formatExpenseStructureShare } from './expense-structure-breakdown';
import type { ChartDataItem } from './use-expenses-structure-data';

const props = defineProps<{
  data: ChartDataItem[];
  totalAmount: number;
}>();

const emit = defineEmits<{
  'category-click': [payload: { categoryId: string; isOther?: boolean }];
}>();

const { formatBaseCurrency } = useFormatCurrency();

const chartContainerRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);

const centerLabel = reactive({
  name: '',
  amount: '',
  percentage: '',
  isHovering: false,
});

const setCenterLabel = (data: ChartDataItem) => {
  centerLabel.name = data.name;
  centerLabel.amount = formatBaseCurrency(data.amount);
  centerLabel.percentage = formatExpenseStructureShare({ amount: data.amount, totalAmount: props.totalAmount });
  centerLabel.isHovering = true;
};

const clearCenterLabel = () => {
  centerLabel.isHovering = false;
};

const setSliceEmphasis = ({
  group,
  selectedElement,
}: {
  group: d3.Selection<SVGGElement, unknown, null, undefined>;
  selectedElement: SVGPathElement;
}) => {
  group.selectAll<SVGPathElement, d3.PieArcDatum<ChartDataItem>>('.arc path').style('opacity', 0.3);
  d3.select(selectedElement).style('opacity', 1);
};

const clearSliceEmphasis = (group: d3.Selection<SVGGElement, unknown, null, undefined>) => {
  group.selectAll('.arc path').style('opacity', 1);
};

const renderChart = () => {
  if (!svgRef.value || !chartContainerRef.value || props.data.length === 0) return;

  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  const width = chartContainerRef.value.clientWidth;
  const height = chartContainerRef.value.clientHeight;

  const glowSize = 10;
  const radius = Math.min(width, height) / 2 - glowSize;
  const innerRadius = radius * 0.7;

  const pie = d3
    .pie<ChartDataItem>()
    .value((data) => data.amount)
    .sort(null);

  const arc = d3.arc<d3.PieArcDatum<ChartDataItem>>().innerRadius(innerRadius).outerRadius(radius);

  const glowArc = d3
    .arc<d3.PieArcDatum<ChartDataItem>>()
    .innerRadius(radius)
    .outerRadius(radius + glowSize);

  const group = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);
  const glowGroup = group.append('g').attr('class', 'glow-group');
  const pieData = pie(props.data);
  const arcs = group.selectAll('.arc').data(pieData).enter().append('g').attr('class', 'arc');

  arcs
    .append('path')
    .attr('d', arc)
    .attr('fill', (data) => data.data.color)
    .attr('stroke', 'var(--card)')
    .attr('stroke-width', 2)
    .attr('role', 'button')
    .attr('tabindex', 0)
    .attr(
      'aria-label',
      (data) =>
        `${data.data.name}: ${formatBaseCurrency(data.data.amount)}, ${formatExpenseStructureShare({ amount: data.data.amount, totalAmount: props.totalAmount })}`,
    )
    .style('cursor', 'pointer')
    .style('transition', 'opacity 0.2s ease')
    .on('mouseenter', function (_event, data) {
      setSliceEmphasis({ group, selectedElement: this });
      glowGroup.selectAll('*').remove();
      glowGroup.append('path').attr('d', glowArc(data)).attr('fill', data.data.color).style('opacity', 0.5);
      setCenterLabel(data.data);
    })
    .on('mouseleave', function () {
      clearSliceEmphasis(group);
      glowGroup.selectAll('*').remove();
      clearCenterLabel();
    })
    .on('focus', function (_event, data) {
      setSliceEmphasis({ group, selectedElement: this });
      glowGroup.selectAll('*').remove();
      glowGroup.append('path').attr('d', glowArc(data)).attr('fill', data.data.color).style('opacity', 0.5);
      setCenterLabel(data.data);
    })
    .on('blur', function () {
      clearSliceEmphasis(group);
      glowGroup.selectAll('*').remove();
      clearCenterLabel();
    })
    .on('click', function (_event, data) {
      emit('category-click', { categoryId: data.data.categoryId, isOther: data.data.isOther });
    })
    .on('keydown', function (event, data) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      emit('category-click', { categoryId: data.data.categoryId, isOther: data.data.isOther });
    });
};

useResizeObserver(chartContainerRef, renderChart);

watch(
  [() => props.data, chartContainerRef],
  async ([newData, container]) => {
    if (newData.length > 0 && container) {
      await nextTick();
      renderChart();
    }
  },
  { immediate: true, deep: true },
);

watch(
  () => props.data,
  () => {
    clearCenterLabel();
  },
);
</script>
