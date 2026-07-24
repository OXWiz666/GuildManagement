import { AttachmentBuilder } from "discord.js";
import type { Command, CommandContext } from "../../types/command.js";
import { brandedEmbed, clampDescription } from "../../embeds/builders.js";
import { BrandColor } from "../../embeds/theme.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

const PREVIEW_LIMIT = 35;

/** `!items [search]` — export the icon-backed boss-drop catalog names. */
export const itemsCommand: Command = {
  name: "items",
  aliases: ["drops", "itemnames", "dropitems"],
  description: "Show boss-drop item names from the shared icon catalog.",
  usage: "!items [search]",
  example: ["!items", "!items ancient boots"],
  category: "Bosses",
  requiresLink: true,
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const query = ctx.rest.trim();
    const items = await ctx.services.boss.listDropItemNames(query || undefined);

    if (items.length === 0) {
      await ctx.message.reply({
        embeds: [
          brandedEmbed(BrandColor.AMBER)
            .setTitle("No catalog items found")
            .setDescription(query ? `No item names matched \`${query}\`.` : "The drop catalog is empty."),
        ],
      });
      return;
    }

    const grouped = groupCounts(items);
    const previewLines = items.slice(0, PREVIEW_LIMIT).map(formatPreviewLine);
    const remainder = items.length - previewLines.length;
    if (remainder > 0) previewLines.push(`...and ${remainder.toLocaleString()} more in the attached file.`);

    const title = query ? `Item Names Matching "${query}"` : "Boss Drop Item Names";
    const embed = brandedEmbed(BrandColor.GOLD)
      .setTitle(title)
      .setDescription(clampDescription(previewLines, 3500))
      .addFields(
        { name: "Total", value: items.length.toLocaleString(), inline: true },
        { name: "Types", value: grouped, inline: true },
      );

    const attachment = new AttachmentBuilder(Buffer.from(renderCatalogFile(items, query), "utf8"), {
      name: query ? `forgekeep-items-${slug(query)}.txt` : "forgekeep-items.txt",
    });

    await ctx.message.reply({ embeds: [embed], files: [attachment] });
  },
};

type CatalogLineItem = Awaited<ReturnType<CommandContext["services"]["boss"]["listDropItemNames"]>>[number];

function formatPreviewLine(item: CatalogLineItem) {
  const rarity = item.rarity ? item.rarity.toUpperCase() : "UNKNOWN";
  const category = item.category ? ` / ${item.category}` : "";
  return `\`${item.itemName}\` - ${rarity} ${item.type}${category}`;
}

function renderCatalogFile(items: CatalogLineItem[], query: string) {
  const header = [
    "ForgeKeep Boss Drop Item Names",
    query ? `Search: ${query}` : "Search: all items",
    `Total: ${items.length}`,
    "",
    "Item Name\tRarity\tType\tCategory",
  ];
  const rows = items.map((item) =>
    [item.itemName, item.rarity ?? "", item.type, item.category ?? ""]
      .map((value) => value.replace(/\t/g, " "))
      .join("\t"),
  );
  return [...header, ...rows, ""].join("\n");
}

function groupCounts(items: CatalogLineItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([type, count]) => `${type}: ${count}`)
    .join("\n");
}

function slug(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "search";
}
