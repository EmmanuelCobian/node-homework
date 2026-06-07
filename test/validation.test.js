const { userSchema } = require("../validation/userSchema");
const { taskSchema, patchTaskSchema } = require("../validation/taskSchema");

describe("user object validation tests", () => {
  it("1. doesn't permit a trivial password", () => {
    const { error } = userSchema.validate(
      { name: "Bob", email: "bob@sample.com", password: "password" },
      { abortEarly: false },
    );
    expect(
      error.details.find((detail) => detail.context.key == "password"),
    ).toBeDefined();
  });

  it("2. the user schema requires that an email be specified", () => {
    const { error } = userSchema.validate(
      { name: "Bob", password: "Password123!@#" },
      { abortEarly: false },
    );
    expect(
      error.details.find((detail) => detail.context.key == "email"),
    ).toBeDefined();
  });

  it("3. the user schema does not accept an invalid email", () => {
    const { error } = userSchema.validate(
      { name: "Bob", email: "bademail.com", password: "Password123!@#" },
      { abortEarly: false },
    );
    expect(
      error.details.find((detail) => detail.context.key == "email"),
    ).toBeDefined();
  });

  it("4. the user schema requires a password", () => {
    const { error } = userSchema.validate(
      { name: "Bob", email: "bob@sample.com" },
      { abortEarly: false },
    );
    expect(
      error.details.find((detail) => detail.context.key == "password"),
    ).toBeDefined();
  });

  it("5. the user schema requires a name", () => {
    const { error } = userSchema.validate(
      { email: "bob@sample.com", password: "Password123!@#" },
      { abortEarly: false },
    );
    expect(
      error.details.find((detail) => detail.context.key == "name"),
    ).toBeDefined();
  });

  it("6. the name must be valid", () => {
    const { error } = userSchema.validate(
      { name: 67, email: "bob@sample.com", password: "Password123!@#" },
      { abortEarly: false },
    );
    expect(
      error.details.find((detail) => detail.context.key == "name"),
    ).toBeDefined();
  });

  it("7. the name must be valid (3 to 30 characters)", () => {
    const { error } = userSchema.validate(
      { name: "Emmanuel", email: "bob@sample.com", password: "Password123!@#" },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
  });
});

describe("task validation tests", () => {
  it("8. the task schema requires a title", () => {
    const { error } = taskSchema.validate(
      { isCompleted: false, priority: "medium" },
      { abortEarly: false },
    );
    expect(
      error.details.find((detail) => detail.context.key == "title"),
    ).toBeDefined();
  });

  it("9. if an isCompleted value is specified, it must be valid", () => {
    const { error } = taskSchema.validate(
      {
        title: "complete assignment",
        isCompleted: "invalid",
        priority: "medium",
      },
      { abortEarly: false },
    );
    expect(
      error.details.find((detail) => detail.context.key == "isCompleted"),
    ).toBeDefined();
  });

  it("10. if an isCompleted value is not specified but the rest of the object is valid, a default of false is provided by validation", () => {
    const { value, error } = taskSchema.validate(
      { title: "complete assignment", priority: "medium" },
      { abortEarly: false },
    );
    expect(value.isCompleted).toBe(false);
  });

  it("11. if isCompleted in the provided object has the value true, it remains true after validation", () => {
    const { value, error } = taskSchema.validate(
      { title: "complete assignment", isCompleted: true, priority: "medium" },
      { abortEarly: false },
    );
    expect(value.isCompleted).toBe(true);
  });
});

describe("task patch validation tests", () => {
  it("12. the patchTaskSchema does not require a title", () => {
    const { value, error } = patchTaskSchema.validate(
      { isCompleted: true, priority: "medium" },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
  });

  it("13. if no value is provided for isCompleted this remains undefined in the return value", () => {
    const { value, error } = patchTaskSchema.validate(
      { priority: "medium" },
      { abortEarly: false },
    );
    expect(value.isCompleted).toBeUndefined();
  });
});
