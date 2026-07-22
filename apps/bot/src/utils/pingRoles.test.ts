import { describe, expect, it } from "vitest";
import {
  buildSpawnCallToAction,
  parsePingRoleIds,
  pingRoleContent,
  pingRoleMentions,
  serializePingRoleIds,
} from "./pingRoles.js";

describe("ping role helpers", () => {
  it("parses one legacy stored role id", () => {
    expect(parsePingRoleIds("123456789012345678")).toEqual(["123456789012345678"]);
  });

  it("parses multiple mentions or stored ids and dedupes them", () => {
    expect(
      parsePingRoleIds("<@&111111111111111111> 222222222222222222, <@&111111111111111111>"),
    ).toEqual(["111111111111111111", "222222222222222222"]);
  });

  it("serializes multiple roles for storage", () => {
    expect(serializePingRoleIds(["111111111111111111", "222222222222222222"])).toBe(
      "111111111111111111,222222222222222222",
    );
  });

  it("renders configured roles as Discord role mentions", () => {
    expect(pingRoleMentions(["111111111111111111", "222222222222222222"])).toBe(
      "<@&111111111111111111> <@&222222222222222222>",
    );
    expect(pingRoleContent("111111111111111111,222222222222222222")).toBe(
      "<@&111111111111111111> <@&222222222222222222>",
    );
  });

  it("puts the call-to-action and the ping roles in one message", () => {
    expect(buildSpawnCallToAction("Larba", "111111111111111111,222222222222222222")).toBe(
      "Log it with `!kill Larba` once it's down. <@&111111111111111111> <@&222222222222222222>",
    );
  });

  it("still shows the call-to-action with no roles configured", () => {
    expect(buildSpawnCallToAction("Larba", null)).toBe("Log it with `!kill Larba` once it's down.");
  });
});
