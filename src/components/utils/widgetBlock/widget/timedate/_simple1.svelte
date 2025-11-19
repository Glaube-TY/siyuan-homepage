<script lang="ts">
	import { onMount } from "svelte";

	export let contentTypeJson: string = "{}";

	let date = new Date();
	let year = date.getFullYear();
	let month = date.getMonth() + 1;
	let week = date.getDay();
	let day = date.getDate();
	let hour = date.getHours();
	let minute = date.getMinutes();
	let second = date.getSeconds();

	let formatDateStr = "";

	// 简单时钟配置
	let simple1Size = 3;
	let simple1FontWeight = 4;
	let simple1ShowSecond = true;
	let simple1ShowDate = true;

	$: formatDateStr = `${getWeekName(week)}, ${day}. ${getMonthName(month)} ${year}`;

	function getMonthName(monthNum) {
		const months = [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		];
		return months[monthNum - 1];
	}

	function getWeekName(weekNum) {
		const weeks = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		return weeks[weekNum];
	}

	onMount(() => {
		if (contentTypeJson) {
			try {
				const config = JSON.parse(contentTypeJson);
				if (config.type === "timedate" && config.data) {
					// 简单时钟配置
					simple1Size = config.data?.simple1Size || 3;
					simple1FontWeight = config.data?.simple1FontWeight || 4;
					simple1ShowSecond = config.data?.simple1ShowSecond ?? true;
					simple1ShowDate = config.data?.simple1ShowDate ?? true;
				}
			} catch (e) {
				console.warn("无法解析 contentTypeJson", e);
			}
		}
		const interval = setInterval(() => {
			date = new Date();
			year = date.getFullYear();
			month = date.getMonth() + 1;
			week = date.getDay();
			day = date.getDate();
			hour = date.getHours();
			minute = date.getMinutes();
			second = date.getSeconds();
		}, 500);

		return () => clearInterval(interval);
	});
</script>

<div
	class="content-display-simple1"
	style="font-weight: {simple1FontWeight * 100};"
>
	{#if simple1ShowDate}
		<div
			class="date-container"
			style="font-size: calc({simple1Size} * 1rem / 2);"
		>
			<span class="date">{formatDateStr}</span>
		</div>
	{/if}
	<div class="time-container" style="font-size: calc({simple1Size} * 1rem);">
		<div
			class="time-hour"
			style="width: calc({simple1Size} * 1rem + 1rem); height: calc({simple1Size} * 1rem + 1rem);"
		>
			{hour.toString().padStart(2, "0")}
		</div>
		<div class="time-colon">:</div>
		<div
			class="time-minute"
			style="width: calc({simple1Size} * 1rem + 1rem); height: calc({simple1Size} * 1rem + 1rem);"
		>
			{minute.toString().padStart(2, "0")}
		</div>
		{#if simple1ShowSecond}
			<div class="time-colon">:</div>
			<div
				class="time-second"
				style="width: calc({simple1Size} * 1rem + 1rem); height: calc({simple1Size} * 1rem + 1rem);"
			>
				{second.toString().padStart(2, "0")}
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	.content-display-simple1 {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		font-family: "微软雅黑", "Microsoft YaHei", sans-serif;

		.date-container {
			color: #464646;
			padding: 0.5rem 1.2rem;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			box-sizing: border-box;
		}

		.time-container {
			display: flex;
			justify-content: center;
			align-items: center;

			.time-hour,
			.time-minute {
				color: #fff;
				background: linear-gradient(#464646 50%, #000000 100%);
				padding: 0.5rem 1.2rem;
				border-radius: 0.5rem;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				box-sizing: border-box;
				box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
			}

			.time-second {
				color: #000000;
				background: linear-gradient(#e3e3e3 0%, #878787 100%);
				padding: 0.5rem 1.2rem;
				border-radius: 0.5rem;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				box-sizing: border-box;
				box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
			}
		}
	}
</style>
