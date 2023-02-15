import {
  GetBaseUoM,
  GetProductsForIngredient,
  GetRecipes,
  GetUnitsData
} from "./supporting-files/data-access";
import { Ingredient, NutrientFact, UnitOfMeasure, UoMName, UoMType } from "./supporting-files/models";
import {
  GetCostPerBaseUnit,
  GetNutrientFactInBaseUnits,
  SumUnitsOfMeasure
} from "./supporting-files/helpers";
import { RunTest, ExpectedRecipeSummary } from "./supporting-files/testing";

console.clear();
console.log("Expected Result Is:", ExpectedRecipeSummary);

const recipeData = GetRecipes(); // the list of 1 recipe you should calculate the information for
const recipeSummary: any = {}; // the final result to pass into the test function

/*
 * YOUR CODE GOES BELOW THIS, DO NOT MODIFY ABOVE (Typescript alerts the unused imports)
 * (You can add more imports if needed)
 * */

type WholeUnitProduct = {
  price: number;
  volume: number;
}

/**
 * Finds the best fit price in case of "Whole unit product"
 * @param volume 
 * @param items 
 * @returns  
 */
function findBestFitPrice(volume: number, items: WholeUnitProduct[]) {
  // order by volume ASC, price ASC
  items.sort((a, b) => {
    if (a.volume < b.volume) {
      return -1;
    } else if (a.volume > b.volume) {
      return 1;
    } else {
      // prices are equal, sort by price
      if (a.price < b.price) {
        return -1;
      } else if (a.price > b.price) {
        return 1;
      } else {
        return 0;
      }
    }
  });

  let bestFit: any = Number.MAX_SAFE_INTEGER;
  let examingVolume = Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < items.length; i++) {
    if (items[i].volume === examingVolume) {
      continue;
    }
    examingVolume = items[i].volume;
    if (volume < items[i].volume) {
      if (items[i].price < bestFit) {
        bestFit = items[i].price;
      }
    } else if (volume === items[i].volume) {
      if (items[i].price < bestFit) {
        bestFit = items[i].price;
      }
    } else {
      const ceil = Math.ceil(volume / items[i].volume);
      if (ceil * items[i].price < bestFit) {
        bestFit = ceil * items[i].price;
      }
    }
  }

  return bestFit;
}

/**
 * Autos convert units
 * automatically convert to another type util meet the target type
 * @param fromUoM 
 * @param toUoMName 
 * @param toUoMType 
 * @returns convert units 
 */
function AutoConvertUnits(
  fromUoM: UnitOfMeasure,
  toUoMName: UoMName,
  toUoMType: UoMType,
): UnitOfMeasure {
  if (fromUoM.uomName === toUoMName && fromUoM.uomType === toUoMType)
    return fromUoM;

  const conversionRate = GetUnitsData().find(
    (x) =>
      x.fromUnitName === fromUoM.uomName &&
      x.fromUnitType === fromUoM.uomType &&
      x.toUnitName === toUoMName &&
      x.toUnitType === toUoMType
  );

  if (conversionRate) {
    return {
      uomAmount: fromUoM.uomAmount * conversionRate.conversionFactor,
      uomName: toUoMName,
      uomType: toUoMType
    };
  } else {
    const middleMapping = GetUnitsData().find(
      (x) =>
        x.fromUnitName === fromUoM.uomName &&
        x.fromUnitType === fromUoM.uomType
    );

    // Recursively convert to the middle unit of measure, then to the target unit of measure
    const middleUoM = AutoConvertUnits(
      fromUoM,
      middleMapping.toUnitName,
      middleMapping.toUnitType
    );

    return AutoConvertUnits(middleUoM, toUoMName, toUoMType);
  }
}

/**
 * Finds cheapest cost for each ingredient
 * @param ingredient 
 * @param unitOfMeasure 
 * @returns cheapest cost for each ingredient 
 */
function findCheapestCostForEachIngredient(ingredient: Ingredient, unitOfMeasure: UnitOfMeasure): any {
  const products = GetProductsForIngredient(ingredient);
  let nutrientFacts!: NutrientFact[];
  let cheapestCost = Number.MAX_SAFE_INTEGER;

  const ArrayOfNotPartialUnitProducts: WholeUnitProduct[] = [];
  let isWholeUnit: boolean = false;
  let amount = 0;
  for (const product of products) {
    try {
      const { supplierProducts } = product;
      for (const supplier of supplierProducts) {
        // Get base unit
        const productPrice = GetCostPerBaseUnit(supplier);
        const baseUnitOfMeasure = GetBaseUoM(supplier.supplierProductUoM.uomType);

        // convert ingredient UOM to base unit
        const ingredientUoM = AutoConvertUnits(unitOfMeasure, baseUnitOfMeasure.uomName, baseUnitOfMeasure.uomType);
        // For special handling of volume type, for eg: we can not buy 450ml, buy the whole bottle instead
        if (baseUnitOfMeasure.uomName === UoMName.millilitres &&
          baseUnitOfMeasure.uomType === UoMType.volume) {
          isWholeUnit = true;
          amount = ingredientUoM.uomAmount;
        }

        const actualCost = productPrice * ingredientUoM.uomAmount;

        if (actualCost < cheapestCost) {
          cheapestCost = actualCost;
          nutrientFacts = product.nutrientFacts;
        }

        ArrayOfNotPartialUnitProducts.push({
          price: supplier.supplierPrice,
          volume: supplier.supplierProductUoM.uomAmount,
        });
      }
    } catch (error) {
    }
  }

  if (isWholeUnit) {
    cheapestCost = findBestFitPrice(amount, ArrayOfNotPartialUnitProducts);
  }

  return { cheapestCost, nutrientFacts };
};

recipeData.reduce((previous, current) => {
  const { recipeName, lineItems } = current;
  // find cheapestCost
  // find all possile prices
  let sum = 0;
  const nutrientsAtCheapestCost = new Map<string, NutrientFact>();
  for (const item of lineItems) {
    const { cheapestCost, nutrientFacts } = findCheapestCostForEachIngredient(item.ingredient, item.unitOfMeasure)
    sum += cheapestCost;

    // Recap all nutrient facts
    for (const nutrientFact of nutrientFacts) {
      const { nutrientName } = nutrientFact;
      const nutrientsAtCheapestCosItem = nutrientsAtCheapestCost.get(nutrientName);
      if (!nutrientsAtCheapestCosItem) {
        nutrientsAtCheapestCost.set(nutrientName, GetNutrientFactInBaseUnits(nutrientFact));
      } else {
        const converted = GetNutrientFactInBaseUnits(nutrientFact);
        const nextAmmount = SumUnitsOfMeasure(converted.quantityAmount, nutrientsAtCheapestCosItem.quantityAmount);

        nutrientsAtCheapestCost.set(nutrientName, {
          nutrientName,
          quantityAmount: nextAmmount,
          quantityPer: nutrientsAtCheapestCosItem.quantityPer,
        });
      }
    }
  }

  // Find cheapest cost for all recipes
  previous[recipeName] = {
    cheapestCost: sum,
    nutrientsAtCheapestCost: [...nutrientsAtCheapestCost.entries()]
      .sort()
      .reduce((previous, [key, values]) => ({
        ...previous,
        [key]: values
      }), {}),
  }

  return previous;
}, recipeSummary);
console.log("🚀 ~ file: main.ts:215 ~ recipeSummary", recipeSummary)

// The test might be failed because the order of nutrients might different.
// I can not find cheapestCost which pass the test case, but don't think it's true because the lowest price of 300ml of cream is already 2.85
/*
 * YOUR CODE ABOVE THIS, DO NOT MODIFY BELOW
 * */
RunTest(recipeSummary);
